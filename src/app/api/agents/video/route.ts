import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { creditDenial, requireWorkspace } from "@/lib/api-guard";
import { chargeForMode, refundForMode, videoGenGate } from "@/lib/credits";
import { startVideo, pollVideo, fetchVideo, hasVideoProvider } from "@/lib/ai/video";

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

  const b = await req.json().catch(() => ({} as any));
  const prompt = String(b.prompt || "").trim();
  if (!prompt) {
    if (gate.enforced) await refundForMode("agent_video");
    return NextResponse.json({ ok: false, error: "Describe the video you want." }, { status: 200 });
  }

  const started = await startVideo(
    prompt,
    b.image ? String(b.image) : undefined,
    b.aspect === "9:16" ? "9:16" : "16:9",
  );

  if (!started.ok) {
    // Nothing was generated — never bill for it.
    if (gate.enforced) await refundForMode("agent_video");
    return NextResponse.json({ ok: false, error: started.error }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    operation: started.operation,
    model: started.model,
    charged: gate.enforced ? gate.cost : 0,
    balance: gate.balance,
  });
}

export async function GET(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to use this feature." }, { status: 401 });

  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  const op = url.searchParams.get("op");

  // Proxy the finished file so the API key never reaches the browser.
  if (file) {
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

  const status = await pollVideo(op);
  if (status.state === "done") {
    // Hand back our own proxied URL, not Google's signed one.
    return NextResponse.json({ ok: true, state: "done", url: `/api/agents/video?file=${encodeURIComponent(status.url)}` });
  }
  return NextResponse.json({ ok: status.state !== "error", ...status });
}
