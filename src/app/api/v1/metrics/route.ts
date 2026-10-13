import { apiAuth, apiError, apiOk } from "@/lib/api/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  GET /api/v1/metrics — the workspace's KPIs.

  Auth through the shared door (scope metrics:read, revocation, expiry,
  per-key read limit). Header only — the old `?key=` fallback stays removed: a
  query string lands in request logs, history and Referer headers.

  Read directly by org id from the key rather than through api_metrics(): the
  key has already been verified, and the same columns are returned in the
  same shape ({ metrics: [{ metric, label, value, unit, delta_pct, status }] }).
*/
export async function GET(req: Request) {
  const auth = await apiAuth(req, "metrics:read", "read", "/api/v1/metrics");
  if (!auth.ok) return auth.res;
  const { ctx, svc } = auth;
  const { data, error } = await svc.from("health_metrics")
    .select("metric_key, label, value, unit, delta_pct, status").eq("org_id", ctx.orgId).limit(500);
  if (error) return apiError(ctx.rid, 500, "internal", "Could not read the metrics. Retry shortly.");
  const metrics = ((data as any[]) || []).map((m) => ({ metric: m.metric_key, label: m.label, value: m.value, unit: m.unit, delta_pct: m.delta_pct, status: m.status }));
  return apiOk(ctx.rid, { metrics });
}
