import { NextResponse } from "next/server";
import { hasSupabase, serviceClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!hasSupabase()) return NextResponse.json({ ok: false, error: "not configured" }, { status: 200 });
  /*
    Header only. The `?key=` fallback was removed: a query string is written to
    Vercel's request logs, browser history, Referer headers and whatever
    monitoring config the URL gets pasted into, and this key is a long-lived
    bearer credential for a whole workspace's financials. The sibling route
    /api/v1/ingest has always been header-only, so this was an inconsistency
    rather than a deliberate affordance.
  */
  const key = req.headers.get("x-api-key") || "";
  if (!key) return NextResponse.json({ ok: false, error: "missing x-api-key" }, { status: 401 });
  /* Rate limit per key (hashed — a raw secret never becomes a cache key). The
     metrics route had none, and its function was directly callable by anon. */
  {
    const { enforce } = await import("@/lib/ratelimit");
    const { createHash } = await import("node:crypto");
    const bucket = createHash("sha256").update(key).digest("hex").slice(0, 32);
    const over = await enforce([{ key: `metrics:${bucket}`, limit: 600, windowSecs: 3600 }]);
    if (over) return NextResponse.json({ ok: false, error: "Rate limit reached for this API key (600 calls an hour)." }, { status: 429 });
  }
  /* Service client: api_metrics is granted to service_role only (2026_zzzt). */
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "The API is not configured on this deployment (service role missing)." }, { status: 503 });
  const { data, error } = await svc.rpc("api_metrics", { p_key: key });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  /* An invalid key used to come back as HTTP 200 — integrators never noticed. */
  if ((data as any)?.ok === false) {
    return NextResponse.json(data, { status: /invalid api key/i.test(String((data as any).error || "")) ? 401 : 400 });
  }
  return NextResponse.json(data);
}
