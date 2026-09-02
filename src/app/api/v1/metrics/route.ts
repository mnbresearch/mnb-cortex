import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";
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
  const sb = createClient();
  const { data, error } = await sb.rpc("api_metrics", { p_key: key });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  return NextResponse.json(data);
}
