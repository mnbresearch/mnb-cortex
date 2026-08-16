import "server-only";
import { geminiImageModels } from "@/lib/ai/models";

// Image generation + editing via Google Gemini (free tier at aistudio.google.com).
// One GEMINI_API_KEY powers both the text engine and image agents.

export function hasImageProvider(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
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
export async function generateImages(prompt: string, inputImageDataUrl?: string): Promise<{ images: string[]; note: string }> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { images: [], note: "no-provider" };

  const parts: any[] = [{ text: prompt }];
  if (inputImageDataUrl) {
    const m = inputImageDataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${imageModel()}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
    });
    const j = await r.json();
    if (!r.ok) return { images: [], note: j?.error?.message || "provider-error" };
    const out: string[] = [];
    const cand = j?.candidates?.[0]?.content?.parts || [];
    for (const p of cand) {
      if (p?.inlineData?.data) out.push(`data:${p.inlineData.mimeType || "image/png"};base64,${p.inlineData.data}`);
    }
    return { images: out, note: out.length ? "ok" : "empty" };
  } catch (e: any) {
    return { images: [], note: e?.message || "error" };
  }
}
