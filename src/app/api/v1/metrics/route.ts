import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!hasSupabase()) return NextResponse.json({ ok: false, error: "not configured" }, { status: 200 });
  const key = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("key") || "";
  if (!key) return NextResponse.json({ ok: false, error: "missing x-api-key" }, { status: 401 });
  const sb = createClient();
  const { data, error } = await sb.rpc("api_metrics", { p_key: key });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  return NextResponse.json(data);
}
