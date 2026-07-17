import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TABLES = ["health_metrics","ai_insights","alerts","sales_orders","sales_pipeline","finance_ledger","invoices","inventory_items","purchase_orders","employees","customers","documents","meetings","market_reports","strategy_docs","workflows","activity"];
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const sb = createClient();
  const out: Record<string, any[]> = {};
  await Promise.all(TABLES.map(async (t) => { const { data } = await sb.from(t).select("*").eq("org_id", orgId); out[t] = data || []; }));
  return new NextResponse(JSON.stringify({ exported: new Date().toISOString(), org: orgId, data: out }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename=mnb-cortex-backup.json` },
  });
}
