import "server-only";
import { aiKey } from "@/lib/ai/byo";
import { geminiImageModels } from "@/lib/ai/models";

// Image generation + editing via Google Gemini (free tier at aistudio.google.com).
// One GEMINI_API_KEY powers both the text engine and image agents.

export function hasImageProvider(): boolean {
  return Boolean(aiKey("GEMINI_API_KEY") || aiKey("GOOGLE_API_KEY"));
}

export function imageModel(): string {
  // "gemini-2.5-flash-image-preview" was the preview name and is gone;
  // the stable endpoint dropped the suffix.
  return geminiImageModels()[0];
}

/**
 * Generate (or edit, when an input image is supplied) images from a prompt.
 * Returns an array of data-URLs. Empty array = no provider / nothing returned.
 */
export const IMAGE_ASPECTS = ["1:1", "4:5", "16:9", "9:16"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

export async function generateImages(prompt: string, inputImageDataUrl?: string, aspect?: ImageAspect): Promise<{ images: string[]; note: string }> {
  const key = aiKey("GEMINI_API_KEY") || aiKey("GOOGLE_API_KEY");
  if (!key) return { images: [], note: "no-provider" };

  const parts: any[] = [{ text: prompt }];
  if (inputImageDataUrl) {
    const m = inputImageDataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }
  /*
    The aspect ratio goes to the model as a SETTING (imageConfig), not as words
    in the prompt — asked in words, image models return a square most of the
    time. An Instagram post, a Story and a banner are different shapes.
  */
  const generationConfig: any = { responseModalities: ["IMAGE", "TEXT"] };
  if (aspect && (IMAGE_ASPECTS as readonly string[]).includes(aspect)) generationConfig.imageConfig = { aspectRatio: aspect };

  /* Walk the candidates: a 404 means that model name was retired — try the next, as text and video already do. */
  let last = "provider-error";
  for (const model of geminiImageModels()) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }], generationConfig }),
        signal: AbortSignal.timeout(50_000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        last = j?.error?.message || `HTTP ${r.status}`;
        if (r.status === 404) continue;
        return { images: [], note: last };
      }
      const out: string[] = [];
      const cand = j?.candidates?.[0]?.content?.parts || [];
      for (const p of cand) {
        if (p?.inlineData?.data) out.push(`data:${p.inlineData.mimeType || "image/png"};base64,${p.inlineData.data}`);
      }
      return { images: out, note: out.length ? "ok" : "empty" };
    } catch (e: any) {
      return { images: [], note: e?.name === "TimeoutError" ? "The image model took too long to answer." : e?.message || "error" };
    }
  }
  return { images: [], note: last };
}
