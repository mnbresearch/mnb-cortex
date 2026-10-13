/*
  The shape every /api/v1 response takes. Pure — tested by scripts/test-api-v1.mjs.

  SUCCESS   { ok: true, data: [...], page: { limit, next_cursor }, request_id }
            (single objects: { ok: true, data: {...}, request_id })
  FAILURE   { ok: false, error: "<human message>", code: "<stable_code>", request_id }

  `error` stays a STRING because the two v1 endpoints that predate this file
  returned { ok:false, error:"..." } and an integrator may already match on
  it; `code` and `request_id` are additions, not replacements.

  Every response carries X-Request-Id, so a customer's support ticket can name
  the exact call.
*/

export const ERROR_CODES = [
  "missing_key", "invalid_key", "revoked_key", "expired_key", "insufficient_scope",
  "rate_limited", "bad_request", "payload_too_large", "not_configured", "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export function requestId(rand: () => string): string {
  return "req_" + rand().replace(/-/g, "").slice(0, 20);
}

export type PageParams = { limit: number; cursor: { c: string; i: string } | null };

export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 200;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  A keyset cursor: (created_at, id) of the last row returned. Offset paging
  skips or repeats rows when records arrive mid-scroll; keyset does not.

  The decoded values go into a PostgREST `or=(...)` filter, so they are
  validated to the exact shapes of a timestamp and a uuid. Anything else is a
  400 — never interpolated. That is the whole defence against filter
  injection through the cursor, and the test suite tries to break it.
*/
export function encodeCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(JSON.stringify({ c: row.created_at, i: row.id }), "utf8").toString("base64url");
}

export function decodeCursor(s: string | null): { c: string; i: string } | null | "bad" {
  if (!s) return null;
  if (s.length > 200 || !/^[A-Za-z0-9_-]+$/.test(s)) return "bad";
  try {
    const v = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (!v || typeof v.c !== "string" || typeof v.i !== "string") return "bad";
    if (!ISO_RE.test(v.c) || !UUID_RE.test(v.i)) return "bad";
    return { c: v.c, i: v.i };
  } catch { return "bad"; }
}

export function parsePage(url: URL): PageParams | { error: string } {
  const rawLimit = url.searchParams.get("limit");
  let limit = PAGE_DEFAULT;
  if (rawLimit !== null) {
    if (!/^\d{1,4}$/.test(rawLimit)) return { error: "limit must be a whole number" };
    limit = Number(rawLimit);
    if (limit < 1 || limit > PAGE_MAX) return { error: `limit must be between 1 and ${PAGE_MAX}` };
  }
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === "bad") return { error: "cursor is not valid — pass back next_cursor exactly as returned" };
  return { limit, cursor };
}

/** A filter value from a closed list, or an error. `null` when absent. */
export function enumParam(url: URL, name: string, allowed: readonly string[]): string | null | { error: string } {
  const v = url.searchParams.get(name);
  if (v === null || v === "") return null;
  const low = v.trim().toLowerCase();
  if (!allowed.includes(low)) return { error: `${name} must be one of: ${allowed.join(", ")}` };
  return low;
}

/** YYYY-MM-DD or an error. */
export function dateParam(url: URL, name: string): string | null | { error: string } {
  const v = url.searchParams.get(name);
  if (v === null || v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z"))) return { error: `${name} must be a date, YYYY-MM-DD` };
  return v;
}

/** The PostgREST `or` filter for "rows strictly after this cursor" in (created_at desc, id desc) order. Inputs are pre-validated. */
export function afterCursorFilter(c: { c: string; i: string }): string {
  /* Values double-quoted, as PostgREST allows inside logical trees, so the timestamp's ":" "." "+" are read as data. */
  return `created_at.lt."${c.c}",and(created_at.eq."${c.c}",id.lt.${c.i})`;
}

/** Fetch limit+1, return limit, and a cursor only when there really is a next page. */
export function pageOut<T extends { created_at: string; id: string }>(rows: T[], limit: number): { data: T[]; next_cursor: string | null } {
  const more = rows.length > limit;
  const data = more ? rows.slice(0, limit) : rows;
  return { data, next_cursor: more && data.length ? encodeCursor(data[data.length - 1]) : null };
}

export function isErr(v: unknown): v is { error: string } {
  return !!v && typeof v === "object" && typeof (v as any).error === "string";
}
