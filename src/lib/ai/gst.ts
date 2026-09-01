// GST Return Intelligence — read a GST return/summary and surface the numbers that matter.
// Figures are extracted by the model; every ratio, split and check is computed in code.
import "server-only";
import { geminiTextModels } from "@/lib/ai/models";
import { generationConfig, FAST, STANDARD, EXTRACT } from "@/lib/ai/generation";

export type GstCheck = { label: string; ok: boolean };
export type GstSignal = { label: string; tone: "good" | "warn" | "bad" | "info"; detail: string };

export type GstAnalysis = {
  period: string;
  gstin: string | null;
  taxableTurnover: number;
  igst: number; cgst: number; sgst: number; cess: number;
  totalTax: number;
  itcAvailable: number;
  netPayable: number;
  effectiveRatePct: number | null;   // total output tax / taxable turnover
  itcUtilPct: number | null;         // ITC / output tax
  itcCarryForward: number;           // ITC left over after set-off
  composition: { igst: number; cgst: number; sgst: number; cess: number }; // % of total tax
  checklist: GstCheck[];
  signals: GstSignal[];
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
    const model = geminiTextModels()[0];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYS }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: generationConfig(EXTRACT, { temperature: 0.1, responseMimeType: "application/json" }) }),
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
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export async function analyzeGst(text: string): Promise<GstAnalysis | null> {
  const raw = await callJson(buildPrompt(text));
  if (!raw) return null;

  const igst = num(raw.igst), cgst = num(raw.cgst), sgst = num(raw.sgst), cess = num(raw.cess);
  const totalTax = igst + cgst + sgst + cess;
  const taxableTurnover = num(raw.taxableTurnover);
  const itcAvailable = num(raw.itcAvailable);
  const netPayable = raw.netPayable != null ? num(raw.netPayable) : Math.max(0, totalTax - itcAvailable);
  const itcCarryForward = Math.max(0, itcAvailable - totalTax);
  const period = String(raw.period || "this period");
  const gstin = raw.gstin ? String(raw.gstin) : null;
  const insights: string[] = Array.isArray(raw.insights) ? raw.insights.map((x: any) => String(x)).slice(0, 4) : [];

  const effectiveRatePct = pct(totalTax, taxableTurnover);
  const itcUtilPct = pct(Math.min(itcAvailable, totalTax), totalTax);
  const composition = {
    igst: totalTax ? Math.round((igst / totalTax) * 100) : 0,
    cgst: totalTax ? Math.round((cgst / totalTax) * 100) : 0,
    sgst: totalTax ? Math.round((sgst / totalTax) * 100) : 0,
    cess: totalTax ? Math.round((cess / totalTax) * 100) : 0,
  };

  // Filing-readiness checklist
  const checklist: GstCheck[] = [
    { label: "GSTIN identified", ok: !!gstin },
    { label: "Return period identified", ok: !!raw.period },
    { label: "Taxable turnover captured", ok: taxableTurnover > 0 },
    { label: "Output tax computed", ok: totalTax > 0 },
    { label: "Input tax credit captured", ok: itcAvailable > 0 },
    { label: "Net payable computed", ok: netPayable >= 0 && (totalTax > 0 || itcAvailable > 0) },
  ];

  // Signals
  const signals: GstSignal[] = [];
  if (netPayable > 0) signals.push({ label: "Cash GST payable", tone: "info", detail: `${inr(netPayable)} to be paid in cash this period after ITC set-off.` });
  else signals.push({ label: "No cash GST due", tone: "good", detail: `ITC covers your output tax — nothing to pay in cash.` });
  if (itcCarryForward > 0) signals.push({ label: "ITC carried forward", tone: "info", detail: `${inr(itcCarryForward)} of unused input credit carries to next period.` });
  if (itcUtilPct != null && itcUtilPct < 40 && totalTax > 0) signals.push({ label: "Low ITC utilisation", tone: "warn", detail: `Only ${itcUtilPct}% of output tax is offset by ITC — check you've claimed all eligible credit.` });
  if (effectiveRatePct != null && effectiveRatePct > 18.5) signals.push({ label: "High effective rate", tone: "warn", detail: `Output tax is ${effectiveRatePct}% of turnover — verify the rate mix and exempt supplies.` });
  if (!gstin) signals.push({ label: "GSTIN missing", tone: "warn", detail: "No GSTIN found — make sure the correct one is on the return before filing." });

  const summaryMd = `## GST summary — ${period}${gstin ? ` · ${gstin}` : ""}
- Taxable turnover: **${inr(taxableTurnover)}**
- Total output tax: **${inr(totalTax)}** (IGST ${inr(igst)} · CGST ${inr(cgst)} · SGST ${inr(sgst)}${cess ? ` · Cess ${inr(cess)}` : ""})
- ITC available: **${inr(itcAvailable)}**${itcCarryForward > 0 ? ` (carry-forward ${inr(itcCarryForward)})` : ""}
- Net GST payable in cash: **${inr(netPayable)}**
${effectiveRatePct != null ? `- Effective tax rate: **${effectiveRatePct}%** of turnover` : ""}
${itcUtilPct != null ? `- ITC utilisation: **${itcUtilPct}%** of output tax` : ""}

${insights.length ? `## What Cortex sees\n${insights.map((i) => `- ${i}`).join("\n")}` : ""}`.trim();

  return {
    period, gstin, taxableTurnover, igst, cgst, sgst, cess, totalTax, itcAvailable, netPayable,
    effectiveRatePct, itcUtilPct, itcCarryForward, composition, checklist, signals, insights, summaryMd,
  };
}
