import { NextResponse } from "next/server";
import { getUserAndOrg, getBusinessContext } from "@/lib/data";
import { runCortex } from "@/lib/ai/cortex";
import { recallContext } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";
import { DEPARTMENTS } from "@/lib/agents/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * Whole-workforce analysis in one model call.
 *
 * Every other AI route in this app sets an explicit budget (30-300s); these
 * seven did not, so they silently inherited whatever the platform default
 * happens to be. That default is not ours to control and has changed between
 * Vercel plans and runtimes, which is a poor thing to hang the product's
 * headline feature on: the failure mode is a 504 with no log line, and the
 * user just sees a button that did nothing.
 */
export const maxDuration = 60;

// The audit engine: scan the business and hand back a prioritised deployment plan.
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  const gate = await chargeForMode("report");
  if (!gate.ok) { const d = creditDenial(gate, "An AI workforce audit"); return NextResponse.json(d.body, { status: d.status }); }

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
