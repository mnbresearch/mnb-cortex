// Bank Statement Intelligence — turn a raw statement into the real cash truth.
// The model extracts + categorises transactions; the maths is computed in code
// (deterministic), so the numbers are trustworthy, not hallucinated.
import "server-only";

export type Txn = { date: string; desc: string; amount: number; direction: "in" | "out"; category: string };
export type BankAnalysis = {
  currency: string;
  period: string;
  count: number;
  inflow: number;
  outflow: number;
  net: number;
  opening: number | null;
  closing: number | null;
  byCategory: { category: string; outflow: number; share: number }[];
  topExpenses: { desc: string; amount: number; date: string; category: string }[];
  topInflows: { desc: string; amount: number; date: string }[];
  insights: string[];
  summaryMd: string;
  transactions: number;
};

const SYS = `You extract and categorise transactions from an Indian business bank statement. Return ONLY valid JSON, no prose, no code fences.`;

function buildPrompt(text: string): string {
  return `Read this bank statement text and return JSON in EXACTLY this shape:
{
  "currency": "INR",
  "period": "e.g. Jul 2026 or a date range",
  "opening": number or null,
  "closing": number or null,
  "transactions": [
    { "date": "YYYY-MM-DD or as printed", "desc": "short cleaned description", "amount": positive number, "direction": "in" or "out", "category": "one of: Sales/Collections, Supplier/Purchase, Salary/Payroll, Rent, Utilities, GST/Tax, Loan/EMI, Bank Charges, Marketing, Logistics, Transfer, Other" }
  ],
  "insights": [ "2-4 short, specific observations about cash, categorised in INR" ]
}
Rules: amount is always positive; use "direction" for in/out. Cap at 120 transactions (most material first). If a value is unknown use null. Do NOT invent transactions that aren't in the text.

STATEMENT:
${text.slice(0, 18000)}`;
}

async function callJson(prompt: string): Promise<any | null> {
  // Gemini first
  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYS }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: "application/json" } }),
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

function safeJson(t: string): any | null {
  if (!t) return null;
  let s = t.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export async function analyzeBankStatement(text: string): Promise<BankAnalysis | null> {
  const raw = await callJson(buildPrompt(text));
  if (!raw || !Array.isArray(raw.transactions)) return null;

  const txns: Txn[] = raw.transactions.slice(0, 200).map((t: any) => ({
    date: String(t.date || ""),
    desc: String(t.desc || "").slice(0, 80),
    amount: Math.abs(Number(t.amount) || 0),
    direction: t.direction === "in" ? "in" : "out",
    category: String(t.category || "Other"),
  })).filter((t: Txn) => t.amount > 0);

  const inflow = txns.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
  const outflow = txns.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
  const net = inflow - outflow;

  const catMap: Record<string, number> = {};
  txns.filter((t) => t.direction === "out").forEach((t) => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
  const byCategory = Object.entries(catMap).map(([category, out]) => ({ category, outflow: out, share: outflow ? Math.round((out / outflow) * 100) : 0 })).sort((a, b) => b.outflow - a.outflow);

  const topExpenses = txns.filter((t) => t.direction === "out").sort((a, b) => b.amount - a.amount).slice(0, 6).map((t) => ({ desc: t.desc, amount: t.amount, date: t.date, category: t.category }));
  const topInflows = txns.filter((t) => t.direction === "in").sort((a, b) => b.amount - a.amount).slice(0, 5).map((t) => ({ desc: t.desc, amount: t.amount, date: t.date }));

  const insights: string[] = Array.isArray(raw.insights) ? raw.insights.map((x: any) => String(x)).slice(0, 4) : [];
  const opening = raw.opening != null ? Number(raw.opening) : null;
  const closing = raw.closing != null ? Number(raw.closing) : null;
  const period = String(raw.period || "this period");

  const summaryMd = `## Cash summary — ${period}
- Money in: **${inr(inflow)}** across ${txns.filter((t) => t.direction === "in").length} credits
- Money out: **${inr(outflow)}** across ${txns.filter((t) => t.direction === "out").length} debits
- Net cash flow: **${net >= 0 ? "+" : "−"}${inr(Math.abs(net))}**${closing != null ? `\n- Closing balance: **${inr(closing)}**` : ""}

## Where the money went
${byCategory.slice(0, 6).map((c) => `- ${c.category}: ${inr(c.outflow)} (${c.share}%)`).join("\n") || "- (no debits found)"}

${insights.length ? `## What Cortex sees\n${insights.map((i) => `- ${i}`).join("\n")}` : ""}`.trim();

  return {
    currency: String(raw.currency || "INR"),
    period, count: txns.length, inflow, outflow, net, opening, closing,
    byCategory, topExpenses, topInflows, insights, summaryMd, transactions: txns.length,
  };
}
