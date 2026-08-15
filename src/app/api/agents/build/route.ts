import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { buildAgentsForBusiness } from "@/lib/agents/runtime";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cortex designs a set of custom agents for the described business. Metered.
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  const gate = await chargeForMode("report");
  if (!gate.ok) { const d = creditDenial(gate, "Designing agents"); return NextResponse.json(d.body, { status: d.status }); }
  const b = await req.json().catch(() => ({} as any));
  const res = await buildAgentsForBusiness(orgId, user?.id ?? null, String(b.business || ""), String(b.goals || ""));
  return NextResponse.json({ ok: true, ...res });
}
