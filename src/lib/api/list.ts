import "server-only";
import { apiAuth, apiError, apiOk } from "@/lib/api/auth";
import { parsePage, afterCursorFilter, pageOut, isErr } from "@/lib/api/http";
import { readFilter, type Resource } from "@/lib/api/resources";

/*
  GET handler for every read resource. The order is the contract:

    auth (scope, expiry, revocation, rate limit)  →  validate every parameter
    →  query with org_id FROM THE KEY  →  page out

  Unknown query parameters are refused, not ignored: an integrator who typos
  `stauts=paid` should get a 400, not every invoice silently.
*/
export async function listResource(req: Request, r: Resource) {
  const auth = await apiAuth(req, r.scope, "read", r.path);
  if (!auth.ok) return auth.res;
  const { ctx, svc } = auth;

  const url = new URL(req.url);
  const known = new Set(["limit", "cursor", ...r.filters.map((f) => f.name)]);
  for (const k of url.searchParams.keys()) {
    if (!known.has(k)) return apiError(ctx.rid, 400, "bad_request", `Unknown parameter "${k.slice(0, 40)}". Allowed: ${[...known].join(", ")}.`);
  }
  const page = parsePage(url);
  if (isErr(page)) return apiError(ctx.rid, 400, "bad_request", page.error);

  let q: any = svc.from(r.table).select(r.fields.map((f) => f.name).join(", ")).eq("org_id", ctx.orgId);
  /* `is_demo IS NOT TRUE` keeps null and false. Not an .or(): the cursor below is the one .or() a request may carry. */
  if (r.hideDemo) q = q.not("is_demo", "is", true);
  for (const f of r.filters) {
    const v = readFilter(f, url.searchParams.get(f.name));
    if ("error" in v) return apiError(ctx.rid, 400, "bad_request", v.error);
    if (v.value === null) continue;
    q = f.kind === "date_gte" ? q.gte(f.column, v.value) : f.kind === "date_lte" ? q.lte(f.column, v.value) : q.eq(f.column, v.value);
  }
  if (page.cursor) q = q.or(afterCursorFilter(page.cursor));
  q = q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(page.limit + 1);

  const { data, error } = await q;
  if (error) return apiError(ctx.rid, 500, "internal", "Could not read the records. Retry shortly.");
  const out = pageOut(((data as any[]) || []), page.limit);
  return apiOk(ctx.rid, { data: out.data, page: { limit: page.limit, next_cursor: out.next_cursor } });
}
