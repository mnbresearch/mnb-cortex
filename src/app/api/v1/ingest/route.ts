import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!hasSupabase()) return NextResponse.json({ ok: false, error: "not configured" }, { status: 200 });
  const key = req.headers.get("x-api-key") || "";
  if (!key) return NextResponse.json({ ok: false, error: "missing x-api-key header" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const table = body.table; const rows = Array.isArray(body.rows) ? body.rows : (body.row ? [body.row] : []);
  if (!table || !rows.length) return NextResponse.json({ ok: false, error: "provide { table, rows: [...] }" }, { status: 400 });
  const sb = createClient();
  const { data, error } = await sb.rpc("api_ingest", { p_key: key, p_table: table, p_rows: rows });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  return NextResponse.json(data);
}
