import { NextResponse } from "next/server";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { creditDenial, requireWorkspace } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, videoGenGate } from "@/lib/credits";
import { startVideo, pollVideo, fetchVideo, hasVideoProvider } from "@/lib/ai/video";
import { buildVideoPrompt } from "@/lib/ai/visual-prompts";
import { usingOwnKey, loadOrgAiKeys, enterOrgAiKeys } from "@/lib/ai/byo";
import { createMedia, jobByOperation, settleVideoJob } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Video agents.
 *
 * Split into submit / status / download because Veo takes 1–3 minutes, which
 * doesn't fit in a single serverless request (and holding a function open that
 * long would be wasteful even where it does).
 *
 *   POST  { prompt, image?, aspect? }  -> { operation }
 *   GET   ?op=<operation>              -> { state: running | done | error }
 *   GET   ?file=<uri>                  -> streams the mp4
 */

export async function POST(req: Request) {
  const auth = await requireWorkspace();
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  if (!hasVideoProvider()) {
    return NextResponse.json(
      { ok: false, needsProvider: true, error: "Video needs a Google GEMINI_API_KEY with Veo access." },
      { status: 200 },
    );
  }

  // Video is the most expensive thing the product can do, so it reuses the
  // same premium entitlement gate as image generation before charging.
  const gate0 = await videoGenGate();
  if (!gate0.allowed) {
    return NextResponse.json({ ok: false, limited: true, error: gate0.reason }, { status: 200 });
  }

  const gate = await chargeForMode("agent_video");
  if (!gate.ok) {
    const d = creditDenial(gate, "Generating a video");
    return NextResponse.json(d.body, { status: d.status });
  }

  /*
    EVERYTHING PAST THE CHARGE IS WRAPPED — and on the most expensive action in
    the product, this handler had no try/catch at all.

    Veo is roughly ₹77 a clip and `agent_video` is priced to match. startVideo()
    is a call to a third-party API that takes one to three minutes to accept a
    job; a timeout, a DNS blip or a malformed response threw straight out of the
    route as an unhandled 500 with the credits already gone. The two careful
    `if (!started.ok)` and `if (!prompt)` refunds below made the omission easy
    to miss: the branches that were thought about were covered, and the branch
    nobody thinks about — the throw — was not.
  */
  try {

  const b = await req.json().catch(() => ({} as any));
  const prompt = String(b.prompt || "").trim();
  if (!prompt) {
    await refundIfCharged(gate, "agent_video");
    return NextResponse.json({ ok: false, error: "Describe the video you want." }, { status: 200 });
  }

  /*
    The user's sentence is a BRIEF, not a shot. Veo responds to camera, lens,
    lighting and pacing language; handed a bare line it invents all four, which
    is why untuned clips look like stock footage. buildVideoPrompt turns the
    brief into a directed single-take shot, styled by the workspace's industry.
  */
  const aspect: "16:9" | "9:16" = b.aspect === "9:16" ? "9:16" : "16:9";
  /* A reference photo is optional; anything that is not a small image data URL is ignored rather than sent. */
  const image = typeof b.image === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(b.image) && b.image.length < 5_000_000 ? b.image : undefined;
  const style: "film" | "ugc" = b.style === "ugc" ? "ugc" : "film";
  const orgProfile = await getOrgProfile().catch(() => null);
  const directed = buildVideoPrompt({
    brief: prompt,
    industry: (orgProfile as any)?.industry,
    aspect,
    hasInputImage: Boolean(image),
    style,
  });

  const started = await startVideo(directed, image, aspect);

  if (!started.ok) {
    // Nothing was generated — never bill for it.
    await refundIfCharged(gate, "agent_video");
    return NextResponse.json({ ok: false, error: started.error }, { status: 200 });
  }

  /*
    THE JOB IS RECORDED, so it can be settled — and refunded if Veo fails
    later — whether or not this browser tab is still open. Before 2026_zzzv the
    table is missing and the job is browser-only, as it was before.
  */
  const job = await createMedia({
    org_id: auth.orgId, user_id: auth.userId ?? null, kind: "video",
    agent_id: typeof b.agentId === "string" ? b.agentId.slice(0, 80) : null,
    title: typeof b.title === "string" ? b.title.slice(0, 120) : null,
    prompt: prompt.slice(0, 2000), aspect, status: "running", operation: started.operation,
    cost: gate.enforced ? gate.cost : 0, charged: Boolean(gate.ok && gate.enforced), byo: usingOwnKey(),
  });

  return NextResponse.json({
    ok: true,
    operation: started.operation,
    mediaId: job.id,
    model: started.model,
    charged: gate.enforced ? gate.cost : 0,
    balance: gate.balance,
  });
  } catch (e: any) {
    await refundIfCharged(gate, "agent_video");
    return NextResponse.json({ ok: false, error: (e?.message || "The video agent could not start.") + " Your credits have not been used." }, { status: 200 });
  }
}

export async function GET(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to use this feature." }, { status: 401 });

  /*
    THE WORKSPACE'S OWN KEY. A job submitted on a workspace's Google key lives
    in that Google project; polling or downloading it with ours fails. The
    keys are loaded here exactly as chargeForMode loads them for the submit.
  */
  enterOrgAiKeys(await loadOrgAiKeys(orgId));   // both never throw: on any failure this is the platform key

  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  const op = url.searchParams.get("op");

  // Proxy the finished file so the API key never reaches the browser.
  if (file) {
    /* Only a file this workspace's own job produced. */
    const svc = (await import("@/lib/supabase/server")).serviceClient();
    if (svc) {
      const { data, error } = await svc.from("media_assets").select("id").eq("org_id", orgId).eq("result_uri", file).limit(1);
      const { isMissingTable } = await import("@/lib/media");
      if (!error && !(data as any[])?.length) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      if (error && !isMissingTable(error)) return NextResponse.json({ ok: false, error: "Could not check access." }, { status: 500 });
    }
    const upstream = await fetchVideo(file);
    if (!upstream || !upstream.ok || !upstream.body) {
      return NextResponse.json({ ok: false, error: "Could not fetch the video." }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  if (!op) return NextResponse.json({ ok: false, error: "Missing operation id." }, { status: 400 });

  const job = await jobByOperation(orgId, op);
  if (job.row) {
    const s = await settleVideoJob(job.row, pollVideo, fetchVideo);
    if (s.state === "running") return NextResponse.json({ ok: true, state: "running" });
    if (s.state === "done") return NextResponse.json({ ok: true, state: "done", url: s.url, mediaId: s.mediaId });
    return NextResponse.json({ ok: false, state: "error", error: `${s.error}${s.refunded ? " Your credits have been refunded." : ""}`, refunded: s.refunded });
  }
  /* Not this workspace's job. Only before the migration (no table) do we fall back to polling blind. */
  if (!job.missing) return NextResponse.json({ ok: false, state: "error", error: "That video job was not found in this workspace." }, { status: 404 });

  const status = await pollVideo(op);
  if (status.state === "done") {
    // Hand back our own proxied URL, not Google's signed one.
    return NextResponse.json({ ok: true, state: "done", url: `/api/agents/video?file=${encodeURIComponent(status.url)}` });
  }
  return NextResponse.json({ ok: status.state !== "error", ...status });
}
