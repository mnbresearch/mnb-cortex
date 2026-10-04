import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { planWorkflowWithModel } from "@/lib/engine/automation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/*
  POST { instruction } → a validated workflow plan, in words and in steps.
  Nothing is saved here; the person reads the plan and chooses "Create".
  Charged as automation_plan (FAST); refunded when the model produced
  nothing the validator accepts — no plan, no charge.
*/
export async function POST(req: Request) {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Creating a workflow needs the analyst role or higher." }, { status: 403 });

  let gate: ChargeResult | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const instruction = String(body?.instruction || "").trim();
    if (instruction.length < 8) return NextResponse.json({ ok: false, error: "Describe the automation in a sentence — e.g. 'every morning refresh my KPIs, list who is overdue and email me'." }, { status: 200 });

    gate = await chargeForMode("automation_plan");
    if (!gate.ok) { const d = creditDenial(gate, "Planning an automation"); return NextResponse.json(d.body, { status: d.status }); }

    const plan = await planWorkflowWithModel(instruction);
    if (!plan.ok) {
      await refundIfCharged(gate, "automation_plan");
      return NextResponse.json({ ok: false, error: plan.error, problems: plan.problems, note: plan.note }, { status: 200 });
    }
    return NextResponse.json({ ok: true, plan: plan.plan, note: plan.note, charged: gate.enforced ? gate.cost : 0 });
  } catch (e: any) {
    await refundIfCharged(gate, "automation_plan");
    return NextResponse.json({ ok: false, error: `${e?.message || "Could not plan that."} Your credits have not been used.` }, { status: 200 });
  }
}
