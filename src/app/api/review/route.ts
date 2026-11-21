import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { chargeForMode, refundIfCharged } from "@/lib/credits";
import { creditDenial } from "@/lib/api-guard";
import { runCortex, isEngineFailure } from "@/lib/ai/cortex";
import { STANDARD } from "@/lib/ai/generation";
import { extractText, canExtract } from "@/lib/knowledge/files";
import { deterministicChecks, reviewPrompt, parseIssues, sortIssues, compareVersions, REVIEW_LIMITS } from "@/lib/review/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  DOCUMENT REVIEW — POST multipart { file | text, purpose?, previous (file) | previousText? }.
  Returns severity-sorted issues (code checks free; the AI pass charged as one
  "document" analysis and refunded on failure) and, when a previous draft is
  given, what changed between the two (free — it is a diff).
*/
async function textOf(form: FormData, fileKey: string, textKey: string): Promise<string | { error: string } | null> {
  const f = form.get(fileKey);
  if (f && typeof f !== "string" && f.size > 0) {
    if (f.size > 15 * 1024 * 1024) return { error: `${f.name} is over 15 MB.` };
    if (!canExtract(f.name, f.type)) return { error: `${f.name}: use PDF, Word, Excel, CSV or text.` };
    const r = await extractText(f.name, new Uint8Array(await f.arrayBuffer()), f.type);
    return r.ok ? r.text : { error: r.error };
  }
  const t = String(form.get(textKey) || "").trim();
  return t ? t : null;
}

export async function POST(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Send a document." }, { status: 400 });
  const doc = await textOf(form, "file", "text");
  if (!doc) return NextResponse.json({ ok: false, error: "Upload a document or paste its text." }, { status: 400 });
  if (typeof doc !== "string") return NextResponse.json({ ok: false, error: doc.error }, { status: 400 });
  const prev = await textOf(form, "previous", "previousText");
  if (prev && typeof prev !== "string") return NextResponse.json({ ok: false, error: prev.error }, { status: 400 });
  const purpose = String(form.get("purpose") || "").slice(0, 120);

  const checks = deterministicChecks(doc);
  const changes = typeof prev === "string" ? compareVersions(prev, doc) : null;

  let aiIssues: ReturnType<typeof parseIssues> = [];
  let aiNote: string | null = null;
  const gate = await chargeForMode("document");
  if (!gate.ok) {
    const d = creditDenial(gate, "The AI review");
    aiNote = d.body.error || "The AI review needs credits; the code checks below are free.";
  } else {
    try {
      const text = await runCortex([{ role: "user", content: reviewPrompt(doc, purpose) }], "", STANDARD);
      if (isEngineFailure(text)) { await refundIfCharged(gate, "document"); aiNote = "The AI review did not answer, so only the code checks ran. Nothing was charged."; }
      else aiIssues = parseIssues(text, doc);
    } catch { await refundIfCharged(gate, "document"); aiNote = "The AI review failed, so only the code checks ran. Nothing was charged."; }
  }
  return NextResponse.json({
    ok: true, truncated: doc.length > REVIEW_LIMITS.chars, chars: doc.length,
    issues: sortIssues([...checks, ...aiIssues]), aiNote, changes,
  });
}
