import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { resolveAgent, fillPrompt, runReasoning, saveRun } from "@/lib/agents/runtime";
import { recallContext } from "@/lib/memory";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  const b = await req.json().catch(() => ({} as any));
  const agent = await resolveAgent(orgId, String(b.agentId || ""));
  if (!agent) return NextResponse.json({ ok: false, error: "Unknown agent." }, { status: 200 });

  if (agent.kind !== "reasoning") {
    return NextResponse.json({
      ok: false, needsProvider: true,
      message: `“${agent.name}” is a ${agent.kind === "video" ? "video" : "image"} agent. Connect an ${agent.kind === "video" ? "video" : "image"}-generation provider (API key + budget) to enable it — the workflow is ready and will run the moment a model is connected.`,
    }, { status: 200 });
  }

  const gate = await chargeForMode("document");
  if (!gate.ok) return NextResponse.json({ ok: false, outOfCredits: true, error: `Out of AI credits (balance ${gate.balance}).` }, { status: 402 });

  const inputs = (b.inputs || {}) as Record<string, string>;
  // Ground the agent in the workspace's memory.
  const mem = orgId ? await recallContext(orgId, Object.values(inputs).join(" ").slice(0, 400), 5) : "";
  let prompt = fillPrompt(agent.prompt, inputs, b.reviseNote ? String(b.reviseNote) : undefined, b.prior ? String(b.prior) : undefined);
  if (mem) prompt = `${prompt}\n\n---\nUse this remembered business context where relevant:\n${mem}`;

  const output = await runReasoning(prompt);
  const version = Number(b.version || 0) + 1;
  const runId = orgId ? await saveRun(orgId, user?.id ?? null, agent, inputs, output, version) : null;
  return NextResponse.json({ ok: true, output, version, runId, agent: { id: agent.id, name: agent.name } });
}
