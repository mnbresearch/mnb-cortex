// Act-on-your-behalf — Cortex drafts a ready-to-send message; the user approves & sends.
import "server-only";
import { geminiTextModels } from "@/lib/ai/models";

export type Draft = { subject: string; body: string };

const KINDS: Record<string, string> = {
  payment_reminder: "a firm-but-polite payment reminder for an overdue invoice",
  supplier: "a professional note to a supplier (negotiation, follow-up, or query)",
  winback: "a warm win-back message to a customer who has gone quiet",
  followup: "a friendly sales follow-up to move a deal forward",
  thankyou: "a genuine thank-you / relationship note to a customer",
  custom: "the message described",
};

const SYS = `You write short, professional business messages for an Indian SME owner. Warm, direct, no fluff, India-aware (INR, GST where relevant). Return ONLY valid JSON: {"subject": "...", "body": "..."}. The body is plain text with real line breaks, ready to send, signed off generically ("Best regards,"). No markdown, no placeholders like [Name] unless truly needed.`;

function safeJson(t: string): any | null {
  if (!t) return null;
  let s = t.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

export async function draftOutreach(kind: string, brief: string, context: string): Promise<Draft | null> {
  const what = KINDS[kind] || KINDS.custom;
  const prompt = `Write ${what}.

Details from the owner: ${brief || "(none — infer sensibly)"}

${context ? `Relevant business context (use only if helpful, do not dump numbers):\n${context.slice(0, 1500)}` : ""}

Return JSON: {"subject": "...", "body": "..."}`;

  // Gemini first
  if (process.env.GEMINI_API_KEY) {
    const model = geminiTextModels()[0];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYS }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 900, responseMimeType: "application/json" } }),
      });
      if (r.ok) { const j = await r.json(); const t = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(""); const p = safeJson(t); if (p?.body) return { subject: String(p.subject || "").slice(0, 200), body: String(p.body || "") }; }
    } catch { /* fall through */ }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: SYS }, { role: "user", content: prompt }], temperature: 0.6, response_format: { type: "json_object" } }),
      });
      if (r.ok) { const j = await r.json(); const t = j?.choices?.[0]?.message?.content || ""; const p = safeJson(t); if (p?.body) return { subject: String(p.subject || "").slice(0, 200), body: String(p.body || "") }; }
    } catch { /* fall through */ }
  }
  return null;
}
