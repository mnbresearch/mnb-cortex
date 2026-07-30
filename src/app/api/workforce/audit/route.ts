import { NextResponse } from "next/server";
import { getUserAndOrg, getBusinessContext } from "@/lib/data";
import { runCortex } from "@/lib/ai/cortex";
import { recallContext } from "@/lib/memory";
import { chargeForMode } from "@/lib/credits";
import { DEPARTMENTS } from "@/lib/agents/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The audit engine: scan the business and hand back a prioritised deployment plan.
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  const gate = await chargeForMode("report");
  if (!gate.ok) return NextResponse.json({ ok: false, outOfCredits: true, error: `Out of AI credits (balance ${gate.balance}).` }, { status: 402 });

  const [context, mem] = await Promise.all([getBusinessContext(), recallContext(orgId, "priorities goals bottlenecks", 8)]);
  const depts = DEPARTMENTS.map((d) => d.name).join(", ");
  const prompt = `You are Cortex's AI-adoption auditor. Based on the business snapshot and remembered context, produce a prioritised plan for putting AI agents to work across these departments: ${depts}.
Return Markdown with: (1) a one-line read of where this business is losing the most time/money, (2) "Deploy first" — 3 agents to run this week with the exact job each does and why, (3) "Next" — 3 more, (4) one metric to watch. Be specific to this business, not generic.

BUSINESS SNAPSHOT:
${context}

${mem}`;

  let plan = "";
  try { plan = await runCortex([{ role: "user", content: prompt }], ""); } catch { plan = ""; }
  return NextResponse.json({ ok: Boolean(plan), plan: plan || "Could not generate the audit right now — try again in a moment." });
}
