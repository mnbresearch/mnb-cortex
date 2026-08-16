import { NextResponse } from "next/server";
import { createClient, hasSupabase, serviceClient } from "@/lib/supabase/server";
import { recomputeQuietly } from "@/lib/metrics";

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
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // An invalid key used to come back inside a 200, so integrators never noticed
  // their pipeline was silently doing nothing.
  const result = (data || {}) as any;
  if (result.ok === false) {
    const unauthorised = /invalid api key/i.test(String(result.error || ""));
    return NextResponse.json(result, { status: unauthorised ? 401 : 400 });
  }

  // Refresh the dashboard KPIs for the workspace this key belongs to, so data
  // pushed through the API shows up immediately like a UI import does.
  try {
    const svc = serviceClient();
    if (svc) {
      const { data: k } = await svc.from("api_keys").select("org_id").eq("key", key).maybeSingle();
      await recomputeQuietly((k as any)?.org_id);
    }
  } catch { /* swept nightly */ }

  return NextResponse.json(result);
}
