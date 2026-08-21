import "server-only";

/**
 * Video generation via Google Veo, on the same GEMINI_API_KEY that already
 * powers the text and image agents.
 *
 * The video agents used to return a flat "connect a video-generation provider
 * (paid) to enable it" — the workflow existed, the provider never did.
 *
 * Veo is LONG-RUNNING: you submit a job and poll an operation, typically
 * 1–3 minutes. That does not fit inside one serverless request on Vercel Hobby
 * (300s ceiling, and burning 300s of function time per video is wasteful), so
 * this is deliberately split — submit returns an operation name, and the
 * browser polls a cheap status endpoint until the file is ready.
 */

const API = "https://generativelanguage.googleapis.com/v1beta";

function key(): string | undefined {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!k || k.trim().length < 20 || /^\[.*\]$/.test(k.trim())) return undefined;
  return k.trim();
}

export function hasVideoProvider(): boolean {
  return Boolean(key());
}

/** Candidate Veo models, best first. Same retirement defence as the text models. */
export function veoModels(): string[] {
  const pinned = (process.env.VEO_MODEL || "").trim();
  // Veo is billed PER SECOND of output. At ai.google.dev (Aug 2026):
  //   Standard $0.40/s -> ~₹306 for an 8s clip
  //   Fast     $0.10/s -> ~₹77
  //   Lite     $0.05/s -> ~₹38
  // Standard was the default while a video cost the customer 40 credits (~₹36),
  // i.e. a ₹270 loss on every clip and up to ₹3.4 lakh a month from a single
  // Business account. Fast at 720p is the quality/cost balance; VEO_MODEL can
  // pin Standard for a premium tier once it is priced for it.
  const fallbacks = ["veo-3.1-fast-generate-preview", "veo-3.1-lite-generate-preview"];
  return pinned ? [pinned, ...fallbacks.filter((m) => m !== pinned)] : fallbacks;
}

export type VideoStart = { ok: boolean; operation?: string; model?: string; error?: string };

/**
 * Kick off a generation. Returns the operation name to poll.
 * `imageDataUrl` turns it into image-to-video (animate this product shot).
 */
export async function startVideo(prompt: string, imageDataUrl?: string, aspect: "16:9" | "9:16" = "16:9"): Promise<VideoStart> {
  const k = key();
  if (!k) return { ok: false, error: "No GEMINI_API_KEY configured for video." };

  const instance: any = { prompt };
  if (imageDataUrl) {
    const m = imageDataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (m) instance.image = { bytesBase64Encoded: m[2], mimeType: m[1] };
  }

  let lastErr = "";
  for (const model of veoModels()) {
    try {
      const r = await fetch(`${API}/models/${model}:predictLongRunning?key=${encodeURIComponent(k)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [instance],
          parameters: { aspectRatio: aspect, personGeneration: "allow_adult" },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.name) return { ok: true, operation: j.name, model };

      lastErr = j?.error?.message || `HTTP ${r.status}`;
      console.error(`[veo] ${model} HTTP ${r.status}: ${String(lastErr).slice(0, 200)}`);
      // 404 = this model name is gone; try the next. Anything else is real.
      if (r.status !== 404) break;
    } catch (e: any) {
      lastErr = e?.message || "network error";
      break;
    }
  }
  return { ok: false, error: lastErr || "Could not start video generation." };
}

export type VideoStatus =
  | { state: "running" }
  | { state: "done"; url: string }
  | { state: "error"; error: string };

/**
 * Poll an operation. When finished, returns a playable URL.
 *
 * Veo hands back a `file` URI that needs the API key appended to download, so
 * we return a proxied URL rather than leaking the key to the browser.
 */
export async function pollVideo(operation: string): Promise<VideoStatus> {
  const k = key();
  if (!k) return { state: "error", error: "No GEMINI_API_KEY configured." };
  if (!/^operations\/|^models\/.+\/operations\//.test(operation)) {
    return { state: "error", error: "Invalid operation id." };
  }

  try {
    const r = await fetch(`${API}/${operation}?key=${encodeURIComponent(k)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { state: "error", error: j?.error?.message || `HTTP ${r.status}` };
    if (!j?.done) return { state: "running" };
    if (j?.error) return { state: "error", error: j.error.message || "Generation failed." };

    const res = j?.response;
    const uri =
      res?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
      res?.generatedVideos?.[0]?.video?.uri ??
      res?.predictions?.[0]?.videoUri;

    if (!uri) return { state: "error", error: "Generation finished but returned no video." };
    return { state: "done", url: uri };
  } catch (e: any) {
    return { state: "error", error: e?.message || "Could not check generation status." };
  }
}

/** Stream the finished file, keeping the API key server-side. */
export async function fetchVideo(uri: string): Promise<Response | null> {
  const k = key();
  if (!k) return null;
  // Only ever fetch from Google's own file host.
  if (!/^https:\/\/generativelanguage\.googleapis\.com\//.test(uri)) return null;
  const sep = uri.includes("?") ? "&" : "?";
  try {
    return await fetch(`${uri}${sep}key=${encodeURIComponent(k)}`);
  } catch {
    return null;
  }
}
