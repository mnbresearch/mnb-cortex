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
  /*
    CONNECT AN APP (2026-10). The Tally bridge — and any accounting connector
    that runs next to the books — pushes through /api/v1/ingest too, but it is
    not a general-purpose integration: it writes sales, invoices, customers and
    stock, never leads, with smaller batches on smaller plans. Giving it its
    own scope lets every live plan connect its books (capability
    "connectors") while the open-ended ingest:write stays a Practice+ feature.
  */
  "connector:write": "Sync your books in from a connector such as the Tally bridge (POST /api/v1/ingest — sales, invoices, customers, stock)",
  "ai:ask": "Ask Cortex a question in plain language — charged in credits like chat (POST /api/v1/ask, and the MCP endpoint)",
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
  /* "Connect an app" presets on /developers — one key per app. */
  tally: ["connector:write"],
  assistant: ["ai:ask", "metrics:read", "invoices:read", "customers:read", "sales:read"],
  automation: ["metrics:read", "invoices:read", "customers:read", "sales:read", "leads:read"],
};

/**
 * THE PLAN CAPABILITIES EACH SCOPE NEEDS. Named as plain strings (they match
 * config.ts `Capability`) so this module stays import-free and testable.
 *
 * A key is issued only if every scope it asks for is allowed, and a call is
 * allowed if the scope that matched the endpoint is allowed — both checks read
 * this one table, so the issue-time and use-time rules cannot drift apart.
 */
export const SCOPE_CAPABILITIES: Record<ApiScope, readonly string[]> = {
  "metrics:read": ["api"],
  "invoices:read": ["api"],
  "customers:read": ["api"],
  "sales:read": ["api"],
  "leads:read": ["api"],
  "ingest:write": ["api", "api_write"],
  "connector:write": ["connectors"],
  "ai:ask": ["api"],
};

/** Which rate-limit bucket a call spends, by the scope that admitted it. */
export type LimitKind = "read" | "write" | "connector" | "ask";
export function limitKindFor(scope: ApiScope, kind: "read" | "write"): LimitKind {
  if (scope === "connector:write") return "connector";
  if (scope === "ai:ask") return "ask";
  return kind;
}

/**
 * Of the scopes an endpoint accepts and the key holds, the first one the plan
 * allows — or null with the first refused capability, for the error message.
 * `allowed(cap)` is the caller's live-plan check (engine/plan-gate.ts).
 */
export function admittingScope(
  keyScopes: ApiScope[],
  need: ApiScope | ApiScope[],
  allowed: (cap: string) => boolean,
): { scope: ApiScope } | { scope: null; refused: string } {
  const needs = Array.isArray(need) ? need : [need];
  let refused = "api";
  /*
    Broadest scope first: a key with ingest:write on Practice is admitted as a
    full integration (leads allowed, 10,000 rows), not as a connector. If the
    plan no longer allows it — a downgrade to Watch — the same key falls back
    to connector:write when it holds that too, and the books keep syncing.
  */
  const order = [...needs].sort((a, b) => (SCOPE_CAPABILITIES[b]?.length ?? 0) - (SCOPE_CAPABILITIES[a]?.length ?? 0));
  for (const s of order) {
    if (!keyScopes.includes(s)) continue;
    const caps = SCOPE_CAPABILITIES[s] || ["api"];
    const miss = caps.find((c) => !allowed(c));
    if (!miss) return { scope: s };
    refused = miss;
  }
  return { scope: null, refused };
}

/** Capabilities a NEW key with these scopes needs — every one, deduplicated. */
export function capabilitiesForScopes(scopes: ApiScope[]): string[] {
  return Array.from(new Set(scopes.flatMap((s) => SCOPE_CAPABILITIES[s] || ["api"])));
}

/**
 * Tables a connector-only key may write. Leads are a sales-team feed, not
 * books, and stay behind ingest:write.
 */
export const CONNECTOR_TABLES = ["sales_orders", "invoices", "customers", "inventory_items"] as const;

/** Rows per ingest call for a connector key, by plan. ingest:write keeps 10,000 everywhere. */
export const CONNECTOR_ROWS_PER_CALL: Record<string, number> = {
  try: 2000, starter: 2000, solo: 2000,
  watch: 5000, growth: 5000,
  watchpro: 10000, practice: 10000, command: 10000, enterprise: 10000,
  business: 10000, aicoo: 10000, premium: 10000,
};
export function connectorRowsPerCall(plan: string | null | undefined): number {
  return CONNECTOR_ROWS_PER_CALL[String(plan || "").toLowerCase()] ?? 2000;
}

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
export const API_LIMITS: Record<LimitKind, Record<string, number>> = {
  read: { watchpro: 1200, practice: 3000, command: 6000, enterprise: 20000 },
  write: { watchpro: 120, practice: 300, command: 600, enterprise: 2000 },
  /*
    Connector pushes. The Tally bridge sends 3–4 calls a run; every 30 minutes
    that is ~8 an hour. Try is sized for a few runs a day, Watch for the
    30-minute default, and the top plans for multi-company CA setups.
  */
  connector: { try: 12, starter: 12, solo: 12, watch: 60, growth: 60, watchpro: 120, practice: 300, command: 600, enterprise: 2000 },
  /* Each ask is an AI call and is charged in credits; this is a runaway-loop guard, not the meter. */
  ask: { watchpro: 60, practice: 120, command: 240, enterprise: 600 },
};
const DEFAULT_LIMIT: Record<LimitKind, number> = { read: 600, write: 60, connector: 12, ask: 30 };
export function hourlyLimit(plan: string | null | undefined, kind: LimitKind): number {
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
