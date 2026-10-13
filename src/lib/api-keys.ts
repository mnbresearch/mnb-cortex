/*
  API KEYS — the pure half. No database, no "server-only", so
  scripts/test-api-keys.mjs can exercise every rule directly.

  WHAT A KEY IS NOW (v2, 2026-10):

      mnbc_<10 hex public id>_<64 hex secret>

    - The secret is 32 bytes (256 bits) from the platform CSPRNG. v1 keys were
      two UUIDv4s (244 bits) — still fine, still accepted, but the master spec
      asks for ≥256 and there is no reason to stop short.
    - Only SHA-256(full key) is stored. A SHA-256 is right and a password KDF
      would be wrong: this is 256 random bits, there is no dictionary to slow
      down, and a KDF would cost every API call for nothing.
    - `mnbc_<id>` is the PREFIX shown in the dashboard and written in audit
      rows. It identifies a key without being enough to use it.
    - The distinctive `mnbc_` start lets secret scanners (GitHub, gitleaks)
      recognise a leaked key by pattern.

  WHAT A KEY MAY DO is its scopes. A key can only do what one of its scopes
  names — there is no "admin" scope and no wildcard. Keys issued before scopes
  existed are migrated to exactly the two powers they had (metrics:read,
  ingest:write); the read endpoints added with scopes need a key that asks
  for them. Granting old keys new powers silently would be the wrong default.

  WHEN A KEY STOPS WORKING: revoked (immediately, recorded, never deleted so
  the audit trail survives), expired (expires_at passed), or replaced by
  rotation (the old key keeps working until its grace period ends, so an
  integration can be switched over without an outage).
*/

export const API_SCOPES = {
  "metrics:read": "Read the workspace's KPIs (GET /api/v1/metrics)",
  "invoices:read": "Read invoices — receivable and payable (GET /api/v1/invoices)",
  "customers:read": "Read customers (GET /api/v1/customers)",
  "sales:read": "Read sales orders (GET /api/v1/sales-orders)",
  "leads:read": "Read leads (GET /api/v1/leads)",
  "ingest:write": "Push records in (POST /api/v1/ingest)",
} as const;

export type ApiScope = keyof typeof API_SCOPES;
export const ALL_SCOPES = Object.keys(API_SCOPES) as ApiScope[];

/** What a pre-scopes key could do, and therefore all it keeps. */
export const LEGACY_SCOPES: ApiScope[] = ["metrics:read", "ingest:write"];

/** Presets offered in the UI. "Read only" is the default — least privilege. */
export const SCOPE_PRESETS: Record<string, ApiScope[]> = {
  read: ["metrics:read", "invoices:read", "customers:read", "sales:read", "leads:read"],
  ingest: ["ingest:write"],
  full: [...ALL_SCOPES],
};

export const KEY_PREFIX = "mnbc_";

/**
 * Could this be a key at all? A cheap pre-check before any database work.
 * Deliberately LENIENT about shape: keys issued before v2 (and before the
 * randomUUID fix) had other formats and were all migrated to hashes, so they
 * must still reach the lookup. It only refuses what cannot be a key — empty,
 * huge, or containing characters no generator ever produced.
 */
export function plausibleKey(s: string): boolean {
  return /^[A-Za-z0-9_.\-]{16,200}$/.test(s);
}

export type Rand = (n: number) => Uint8Array;

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * A new key. `rand` is injectable for tests; production passes
 * crypto.randomBytes. Returns the plaintext ONCE — callers store `hash` and
 * `prefix` and hand `key` to the user, nowhere else.
 */
export function newKey(rand: Rand, sha256Hex: (s: string) => string): { key: string; prefix: string; hash: string } {
  const id = hex(rand(5));
  const secret = hex(rand(32));
  if (id.length !== 10 || secret.length !== 64) throw new Error("random source returned too few bytes");
  const key = `${KEY_PREFIX}${id}_${secret}`;
  return { key, prefix: `${KEY_PREFIX}${id}`, hash: sha256Hex(key) };
}

/**
 * The key from a request: `Authorization: Bearer <key>` (the standard) or
 * `x-api-key` (what v1 documented, still honoured). Never the query string —
 * a URL is written to logs, history and Referer headers.
 */
export function keyFromHeaders(h: { get(name: string): string | null }): string {
  const auth = (h.get("authorization") || "").trim();
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (m) return m[1];
  return (h.get("x-api-key") || "").trim();
}

/** Only known scopes survive, deduplicated, in catalogue order. */
export function normaliseScopes(input: unknown): ApiScope[] {
  const want = new Set((Array.isArray(input) ? input : String(input ?? "").split(/[\s,]+/)).map((s) => String(s).trim()));
  return ALL_SCOPES.filter((s) => want.has(s));
}

export const EXPIRY_CHOICES = { "30": 30, "90": 90, "180": 180, "365": 365, never: null } as const;
export type ExpiryChoice = keyof typeof EXPIRY_CHOICES;

/** ISO expiry for a UI choice; unknown input falls back to 365 days, never to "never". */
export function expiryFrom(choice: unknown, now: number): string | null {
  const c = String(choice ?? "") as ExpiryChoice;
  const days = c in EXPIRY_CHOICES ? EXPIRY_CHOICES[c] : 365;
  return days === null ? null : new Date(now + days * 86_400_000).toISOString();
}

/** Grace for the replaced key on rotation. 0 = "regenerate": the old key dies now. */
export const ROTATION_GRACE_HOURS = [0, 24, 168] as const;
export function graceHours(input: unknown): number {
  const n = Number(input);
  return (ROTATION_GRACE_HOURS as readonly number[]).includes(n) ? n : 24;
}

export type KeyRow = {
  id: string;
  org_id: string;
  scopes?: string[] | null;
  expires_at?: string | null;
  revoked_at?: string | null;
};

export type KeyVerdict =
  | { ok: true; scopes: ApiScope[] }
  | { ok: false; status: 401 | 403; code: "invalid_key" | "revoked_key" | "expired_key" | "insufficient_scope"; message: string };

/**
 * May this key do this? Pure, so every branch is tested.
 *
 * `scopes === undefined` means the database predates scopes (migration not
 * yet applied) — the key keeps its legacy powers rather than being locked out
 * by a deploy that ran before its SQL. `null` or `[]` after migration means
 * no powers, and is refused.
 */
export function judgeKey(row: KeyRow | null, need: ApiScope | ApiScope[], now: number): KeyVerdict {
  if (!row || !row.org_id) return { ok: false, status: 401, code: "invalid_key", message: "Invalid API key." };
  if (row.revoked_at) return { ok: false, status: 401, code: "revoked_key", message: "This API key was revoked. Create a new one under Developers." };
  if (row.expires_at && Date.parse(row.expires_at) <= now) {
    return { ok: false, status: 401, code: "expired_key", message: "This API key has expired. Rotate it under Developers." };
  }
  const scopes = row.scopes === undefined ? LEGACY_SCOPES : normaliseScopes(row.scopes || []);
  /* An array means ANY of these will do (whoami accepts any working key). */
  const needs = Array.isArray(need) ? need : [need];
  if (!needs.length || !needs.some((n) => scopes.includes(n))) {
    return { ok: false, status: 403, code: "insufficient_scope", message: `This key does not have the ${needs.join(" or ")} scope.` };
  }
  return { ok: true, scopes };
}

/**
 * Hourly call limits per key, sized by plan. The rate-limit bucket is named
 * from the key's row id (never its secret), so each key has its own
 * allowance and a raw secret never becomes a cache key.
 */
export const API_LIMITS: Record<"read" | "write", Record<string, number>> = {
  read: { watchpro: 1200, practice: 3000, command: 6000, enterprise: 20000 },
  write: { watchpro: 120, practice: 300, command: 600, enterprise: 2000 },
};
const DEFAULT_LIMIT = { read: 600, write: 60 };
export function hourlyLimit(plan: string | null | undefined, kind: "read" | "write"): number {
  return API_LIMITS[kind][String(plan || "").toLowerCase()] ?? DEFAULT_LIMIT[kind];
}

/** Do not write last_used_at on every call — once per 5 minutes is plenty to answer "is this key in use?". */
export function shouldTouch(lastUsedAt: string | null | undefined, now: number): boolean {
  if (!lastUsedAt) return true;
  const t = Date.parse(lastUsedAt);
  return !Number.isFinite(t) || now - t >= 5 * 60_000;
}

/** What the dashboard says about a key. `usable` = it would authenticate right now. */
export function keyStatus(row: { revoked_at?: string | null; expires_at?: string | null }, now: number):
  { state: "active" | "expiring" | "expired" | "revoked"; label: string; usable: boolean } {
  if (row.revoked_at) return { state: "revoked", label: "revoked", usable: false };
  if (row.expires_at) {
    const left = Date.parse(row.expires_at) - now;
    if (left <= 0) return { state: "expired", label: "expired", usable: false };
    if (left < 14 * 86_400_000) {
      const days = Math.max(1, Math.ceil(left / 86_400_000));
      return { state: "expiring", label: `expires in ${days} day${days === 1 ? "" : "s"}`, usable: true };
    }
  }
  return { state: "active", label: "active", usable: true };
}
