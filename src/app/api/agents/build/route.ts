import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { buildAgentsForBusiness } from "@/lib/agents/runtime";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged } from "@/lib/credits";
import { hasRole } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cortex designs a set of custom agents for the described business. Metered.
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  /* Designing agents writes them to the workspace via the service client — RLS cannot stop a viewer. */
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, count: 0, agents: [], error: "Designing agents needs the analyst role or higher." }, { status: 403 });

  const b = await req.json().catch(() => ({} as any));
  /* Capped before the charge: this text goes straight into a paid prompt. */
  const business = String((b as any).business || "").trim().slice(0, 2_000);
  const goals = String((b as any).goals || "").slice(0, 2_000);

  const gate = await chargeForMode("report");
  if (!gate.ok) { const d = creditDenial(gate, "Designing agents"); return NextResponse.json(d.body, { status: d.status }); }

  /*
    buildAgentsForBusiness() swallows its own failures — a model error, JSON
    that will not parse, or a missing service client each return
    `{ count: 0, agents: [] }`. The route then answered `ok: true` with an empty
    list, so the console showed "designed 0 agents" and the customer had paid
    the full report price for it. `count` is the honest signal here, not the
    absence of an exception.
  */
  try {
    const res = await buildAgentsForBusiness(orgId, user?.id ?? null, business, goals);
    if (!res || !res.count) {
      await refundIfCharged(gate, "report");
      return NextResponse.json({ ok: false, count: 0, agents: [], error: "Cortex could not design agents from that description — try describing the business in a little more detail. Your credits have not been used." });
    }
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    await refundIfCharged(gate, "report");
    return NextResponse.json({ ok: false, count: 0, agents: [], error: (e?.message || "Could not design agents.") + " Your credits have not been used." });
  }
}
