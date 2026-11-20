import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { chargeForMode, refundIfCharged } from "@/lib/credits";
import { creditDenial } from "@/lib/api-guard";
import { aiKey } from "@/lib/ai/byo";
import { geminiTextModels, geminiUrl } from "@/lib/ai/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
  NOTETAKER — meeting audio → transcript, which the Meeting Assistant then turns
  into minutes, decisions and actions.

  Honest limits, enforced here rather than promised:
    - One recording up to 18 MB (about 30–40 minutes of compressed speech);
      the file is sent inline to Gemini and never stored by Cortex.
    - Audio cannot be name-masked the way text is (lib/ai/dlp). So the caller
      must send consent=1, which the page only does after the person ticks a
      box that says exactly that. Without it, nothing is sent and nothing is
      charged.
    - Charged as one "meeting" analysis; refunded if no transcript comes back.
*/
const MAX = 18 * 1024 * 1024;
const TYPES: Record<string, string> = { mp3: "audio/mp3", mpeg: "audio/mp3", m4a: "audio/aac", aac: "audio/aac", wav: "audio/wav", webm: "audio/webm", ogg: "audio/ogg", flac: "audio/flac", mp4: "audio/mp4" };

const PROMPT = `Transcribe this meeting recording.
- Write what was said, word for word, in the language spoken (keep English, Hindi or Hinglish as spoken; do not translate).
- Start a new line at each change of speaker, as "Speaker 1:", "Speaker 2:" and so on, with a [mm:ss] timestamp.
- Do not summarise, add headings or comment. If a part is inaudible, write [inaudible].`;

export async function POST(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ ok: false, error: "Choose an audio file." }, { status: 400 });
  if (form?.get("consent") !== "1") return NextResponse.json({ ok: false, error: "Confirm that the audio may be sent to the AI provider unmasked." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: "That recording is over 18 MB. Export it as a compressed audio file (MP3 or M4A) or split it." }, { status: 413 });
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const mime = TYPES[ext] || (file.type.startsWith("audio/") ? file.type : "");
  if (!mime) return NextResponse.json({ ok: false, error: "Use an audio file: MP3, M4A, WAV, WEBM, OGG or FLAC." }, { status: 415 });

  const gate = await chargeForMode("meeting");
  if (!gate.ok) { const d = creditDenial(gate, "Transcribing a meeting"); return NextResponse.json(d.body, { status: d.status }); }
  const key = aiKey("GEMINI_API_KEY");
  if (!key) { await refundIfCharged(gate, "meeting"); return NextResponse.json({ ok: false, error: "Audio transcription needs a Gemini key on the platform or in AI keys. Nothing was charged." }, { status: 503 }); }

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    let lastErr = "";
    for (const model of geminiTextModels()) {
      const r = await fetch(geminiUrl(model, key), {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(110_000),
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data } }, { text: PROMPT }] }], generationConfig: { temperature: 0, maxOutputTokens: 16384 } }),
      });
      if (r.status === 404) { lastErr = "model retired"; continue; }
      const j: any = await r.json().catch(() => ({}));
      const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
      if (r.ok && text) return NextResponse.json({ ok: true, transcript: text.slice(0, 120_000), model });
      lastErr = j?.error?.message || `HTTP ${r.status}`;
      break;
    }
    await refundIfCharged(gate, "meeting");
    return NextResponse.json({ ok: false, error: `No transcript came back (${String(lastErr).slice(0, 120)}). Nothing was charged.` }, { status: 502 });
  } catch (e: any) {
    await refundIfCharged(gate, "meeting");
    return NextResponse.json({ ok: false, error: `Transcription failed: ${String(e?.message || e).slice(0, 120)}. Nothing was charged.` }, { status: 502 });
  }
}
