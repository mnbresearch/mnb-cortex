import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { resolveAgent, fillPrompt, runReasoning, saveRun } from "@/lib/agents/runtime";
import { recallContext } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, imageGenGate } from "@/lib/credits";
import { hasImageProvider, generateImages } from "@/lib/ai/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function imagePrompt(name: string, id: string, inputs: Record<string, string>, hasInput: boolean): string {
  const brief = Object.values(inputs).filter(Boolean).join(". ");
  const suffix = id.split(".").pop() || "";
  const base: Record<string, string> = {
    mockup3d: `Create a photorealistic 3D product mockup. ${brief}. Studio lighting, seamless background, sharp detail, e-commerce ready.`,
    materialswap: `${hasInput ? "Edit the provided product image: " : ""}${brief}. Change only the material/metal/colour realistically; keep the shape, proportions and composition identical.`,
    enhance: `${hasInput ? "Enhance the provided photo: " : ""}remove blur, fix lighting, boost clarity and detail while keeping it natural. ${brief}`,
    cleanup: `${hasInput ? "Take the provided product photo and " : ""}remove the background, place the product on a clean ${brief || "white"} studio backdrop with soft shadow. Professional catalogue look.`,
  };
  return base[suffix] || `Produce a high-quality product image. ${brief}. Clean, professional, e-commerce ready.`;
}

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  const b = await req.json().catch(() => ({} as any));
  const agent = await resolveAgent(orgId, String(b.agentId || ""));
  if (!agent) return NextResponse.json({ ok: false, error: "Unknown agent." }, { status: 200 });
  const inputs = (b.inputs || {}) as Record<string, string>;

  // ---- Video: no free provider yet ----
  if (agent.kind === "video") {
    return NextResponse.json({ ok: false, needsProvider: true, message: `“${agent.name}” is a video agent. The workflow is built; connect a video-generation provider (paid) to enable it.` }, { status: 200 });
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
    const prompt = imagePrompt(agent.name, agent.id, inputs, Boolean(b.image)) + (b.reviseNote ? ` Revision: ${b.reviseNote}.` : "");
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
