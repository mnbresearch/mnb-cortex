// GST Return Intelligence — read a GST return/summary and surface the numbers that matter.
import "server-only";

export type GstAnalysis = {
  period: string;
  gstin: string | null;
  taxableTurnover: number;
  igst: number; cgst: number; sgst: number; cess: number;
  totalTax: number;
  itcAvailable: number;
  netPayable: number;
  insights: string[];
  summaryMd: string;
};

const SYS = `You read Indian GST returns/summaries (GSTR-1, GSTR-3B, GSTR-2B or a portal summary). Return ONLY valid JSON, no prose, no code fences.`;

function buildPrompt(text: string): string {
  return `Extract GST figures from this return/summary and return JSON in EXACTLY this shape (all amounts in INR, numbers only, use null if truly absent):
{
  "period": "e.g. Jul 2026 or Apr-Jun 2026",
  "gstin": "the GSTIN if present or null",
  "taxableTurnover": number,
  "igst": number, "cgst": number, "sgst": number, "cess": number,
  "itcAvailable": number,
  "netPayable": number or null,
  "insights": ["2-4 short specific observations in INR about tax liability, ITC, or filing"]
}
Do not invent figures not in the text.

RETURN:
${text.slice(0, 16000)}`;
}

function safeJson(t: string): any | null {
  if (!t) return null;
  let s = t.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

async function callJson(prompt: string): Promise<any | null> {
  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYS }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" } }),
      });
      if (r.ok) { const j = await r.json(); const t = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(""); const parsed = safeJson(t); if (parsed) return parsed; }
    } catch { /* fall through */ }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: SYS }, { role: "user", content: prompt }], temperature: 0.1, response_format: { type: "json_object" } }),
      });
      if (r.ok) { const j = await r.json(); const t = j?.choices?.[0]?.message?.content || ""; const parsed = safeJson(t); if (parsed) return parsed; }
    } catch { /* fall through */ }
  }
  return null;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const num = (v: any) => (v == null || isNaN(Number(v)) ? 0 : Number(v));

export async function analyzeGst(text: string): Promise<GstAnalysis | null> {
  const raw = await callJson(buildPrompt(text));
  if (!raw) return null;

  const igst = num(raw.igst), cgst = num(raw.cgst), sgst = num(raw.sgst), cess = num(raw.cess);
  const totalTax = igst + cgst + sgst + cess;
  const taxableTurnover = num(raw.taxableTurnover);
  const itcAvailable = num(raw.itcAvailable);
  const netPayable = raw.netPayable != null ? num(raw.netPayable) : Math.max(0, totalTax - itcAvailable);
  const period = String(raw.period || "this period");
  const gstin = raw.gstin ? String(raw.gstin) : null;
  const insights: string[] = Array.isArray(raw.insights) ? raw.insights.map((x: any) => String(x)).slice(0, 4) : [];

  const summaryMd = `## GST summary — ${period}${gstin ? ` · ${gstin}` : ""}
- Taxable turnover: **${inr(taxableTurnover)}**
- Total output tax: **${inr(totalTax)}** (IGST ${inr(igst)} · CGST ${inr(cgst)} · SGST ${inr(sgst)}${cess ? ` · Cess ${inr(cess)}` : ""})
- ITC available: **${inr(itcAvailable)}**
- Net GST payable: **${inr(netPayable)}**

${insights.length ? `## What Cortex sees\n${insights.map((i) => `- ${i}`).join("\n")}` : ""}`.trim();

  return { period, gstin, taxableTurnover, igst, cgst, sgst, cess, totalTax, itcAvailable, netPayable, insights, summaryMd };
}
