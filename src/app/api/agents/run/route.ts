import { NextResponse } from "next/server";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { resolveAgent, fillPrompt, runReasoning, saveRun } from "@/lib/agents/runtime";
import { recallContext } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, imageGenGate } from "@/lib/credits";
import { hasImageProvider, generateImages } from "@/lib/ai/image";
import { buildImagePrompt } from "@/lib/ai/visual-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * Runs an agent end to end — the longest of these by design.
 *
 * Every other AI route in this app sets an explicit budget (30-300s); these
 * seven did not, so they silently inherited whatever the platform default
 * happens to be. That default is not ours to control and has changed between
 * Vercel plans and runtimes, which is a poor thing to hang the product's
 * headline feature on: the failure mode is a 504 with no log line, and the
 * user just sees a button that did nothing.
 */
export const maxDuration = 60;

/*
  Image prompts are now composed in lib/ai/visual-prompts.ts, which adds the
  camera, lighting and composition language these models actually respond to,
  and varies it by industry — a silver ring and a plate of biryani need opposite
  treatments. The four one-line templates that used to live here produced the
  model's default look: a flatly lit object on grey.
*/
function imagePrompt(agentId: string, inputs: Record<string, string>, hasInput: boolean, industry?: string | null, revision?: string): string {
  const brief = Object.values(inputs).filter(Boolean).join(". ");
  return buildImagePrompt({
    kind: agentId.split(".").pop() || "",
    brief,
    industry,
    hasInputImage: hasInput,
    revision,
  });
}

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  const b = await req.json().catch(() => ({} as any));
  const agent = await resolveAgent(orgId, String(b.agentId || ""));
  if (!agent) return NextResponse.json({ ok: false, error: "Unknown agent." }, { status: 200 });
  const inputs = (b.inputs || {}) as Record<string, string>;

  // ---- Video: handled by its own async route ----
  // Veo takes 1-3 minutes, so it can't run inside this request. The console
  // posts to /api/agents/video and polls. This branch only exists to stop an
  // old client silently getting nothing back.
  if (agent.kind === "video") {
    return NextResponse.json({
      ok: false,
      useVideoEndpoint: true,
      error: `"${agent.name}" is a video agent — please refresh the page to load the video runner.`,
    }, { status: 200 });
  }

  // ---- Image agents (premium, gated) ----
  if (agent.kind === "image") {
    if (!hasImageProvider()) {
      return NextResponse.json({ ok: false, needsProvider: true, message: `“${agent.name}” needs an image model. Add a Google GEMINI_API_KEY (aistudio.google.com) to enable image agents.` }, { status: 200 });
    }
    // Premium access gate: plan + weekly quota. Fails closed.
    const ig = await imageGenGate();
    if (!ig.allowed) {
      return NextResponse.json({ ok: false, limited: true, message: ig.reason, used: ig.used, limit: ig.limit, plan: ig.plan }, { status: 200 });
    }
    const gate = await chargeForMode("agent_image");
    if (!gate.ok) { const d = creditDenial(gate, "Generating an image"); return NextResponse.json(d.body, { status: d.status }); }
    // The workspace's industry decides the lighting and styling direction.
  const orgProfile = await getOrgProfile().catch(() => null);
  const prompt = imagePrompt(agent.id, inputs, Boolean(b.image), (orgProfile as any)?.industry, b.reviseNote ? String(b.reviseNote) : undefined);
    const { images, note } = await generateImages(prompt, b.image ? String(b.image) : undefined);
    if (!images.length) {
      return NextResponse.json({ ok: false, error: note === "empty" ? "The image model returned no image — try a clearer brief, or set GEMINI_IMAGE_MODEL to a valid image model." : `Image provider error: ${note}` }, { status: 200 });
    }
    const version = Number(b.version || 0) + 1;
    if (orgId) await saveRun(orgId, user?.id ?? null, agent, inputs, "[image generated]", version);
    const left = ig.limit < 0 ? -1 : Math.max(0, ig.limit - ig.used - 1);
    return NextResponse.json({ ok: true, images, version, quota: { limit: ig.limit, left }, agent: { id: agent.id, name: agent.name } });
  }

  // ---- Reasoning agents ----
  const gate = await chargeForMode("document");
  if (!gate.ok) { const d = creditDenial(gate, "Running an agent"); return NextResponse.json(d.body, { status: d.status }); }
  const mem = orgId ? await recallContext(orgId, Object.values(inputs).join(" ").slice(0, 400), 5) : "";
  let prompt = fillPrompt(agent.prompt, inputs, b.reviseNote ? String(b.reviseNote) : undefined, b.prior ? String(b.prior) : undefined);
  if (mem) prompt = `${prompt}\n\n---\nUse this remembered business context where relevant:\n${mem}`;
  const output = await runReasoning(prompt);
  const version = Number(b.version || 0) + 1;
  const runId = orgId ? await saveRun(orgId, user?.id ?? null, agent, inputs, output, version) : null;
  return NextResponse.json({ ok: true, output, version, runId, agent: { id: agent.id, name: agent.name } });
}
