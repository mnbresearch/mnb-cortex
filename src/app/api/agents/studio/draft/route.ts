import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { chargeForMode, refundIfCharged } from "@/lib/credits";
import { creditDenial } from "@/lib/api-guard";
import { runCortex, isEngineFailure } from "@/lib/ai/cortex";
import { FAST } from "@/lib/ai/generation";
import { draftPrompt, parseDraft, validateSpec, permissionCard } from "@/lib/agents/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/*
  Agent Studio — draft an agent from a plain-words description.
  Metered at the agent_plan price (one planning-sized model call) and refunded
  when the model fails or returns nothing usable. The draft is NOT saved: the
  admin reviews every field — above all the tools — and saves it themselves.
*/
export async function POST(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("manager"))) return NextResponse.json({ ok: false, error: "Building agents needs the manager role or higher." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  /* Capped before the charge: this text goes straight into a paid prompt. */
  const description = String(b.description || "").trim().slice(0, 1500);
  if (description.length < 15) return NextResponse.json({ ok: false, error: "Describe the job in a sentence or two: what it should look at, for whom, and how often." }, { status: 400 });

  const gate = await chargeForMode("agent_plan");
  if (!gate.ok) { const d = creditDenial(gate, "Drafting an agent"); return NextResponse.json(d.body, { status: d.status }); }
  try {
    const text = await runCortex([{ role: "user", content: draftPrompt(description) }], "", FAST);
    const draft = isEngineFailure(text) ? null : parseDraft(text);
    if (!draft) {
      await refundIfCharged(gate, "agent_plan");
      return NextResponse.json({ ok: false, error: "Cortex could not draft an agent from that. Try saying what it should look at and what it should hand back. Your credits have not been used." });
    }
    const v = validateSpec(draft);
    return NextResponse.json({ ok: true, draft, card: permissionCard({ tools: draft.tools || [] }), problem: v.ok ? null : v.error });
  } catch (e: any) {
    await refundIfCharged(gate, "agent_plan");
    return NextResponse.json({ ok: false, error: (e?.message || "Could not draft the agent.") + " Your credits have not been used." });
  }
}
