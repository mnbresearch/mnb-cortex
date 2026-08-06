// Bank Statement Intelligence — turn a raw statement into the real cash truth.
// The model extracts + categorises transactions; ALL the maths (totals, trends,
// recurring detection, counterparties, health) is computed in code (deterministic),
// so the numbers are trustworthy, not hallucinated.
import "server-only";

export type Txn = { date: string; desc: string; amount: number; direction: "in" | "out"; category: string };
export type MonthPoint = { key: string; label: string; inflow: number; outflow: number; net: number };
export type Recurring = { desc: string; count: number; total: number; avg: number; category: string };
export type Party = { name: string; total: number; count: number };
export type Signal = { label: string; tone: "good" | "warn" | "bad" | "info"; detail: string };

export type BankAnalysis = {
  currency: string;
  period: string;
  count: number;
  inflow: number;
  outflow: number;
  net: number;
  opening: number | null;
  closing: number | null;
  avgTxn: number;
  netMarginPct: number | null;      // net as % of inflow
  topCategoryShare: number;         // biggest spend category, % of outflow
  burnPerMonth: number | null;      // avg monthly net outflow when cash-negative
  runwayMonths: number | null;      // closing balance / burn, when applicable
  byCategory: { category: string; outflow: number; share: number }[];
  monthly: MonthPoint[];
  recurring: Recurring[];
  counterpartiesOut: Party[];
  counterpartiesIn: Party[];
  topExpenses: { desc: string; amount: number; date: string; category: string }[];
  topInflows: { desc: string; amount: number; date: string }[];
  signals: Signal[];
  health: { score: number; label: string };
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
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Best-effort YYYY-MM from a printed date. Returns null if unparseable. */
function monthKey(d: string): string | null {
  const s = String(d || "").trim();
  let m = s.match(/(\d{4})[-/.](\d{1,2})/);                 // 2026-07
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);      // 05/07/2026 → assume DD/MM/YYYY (India)
  if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${String(m[2]).padStart(2, "0")}`; }
  const mon = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,'-]*(\d{4})/i); // Jul 2026
  if (mon) { const idx = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(mon[1].toLowerCase().slice(0, 3)) + 1; return `${mon[2]}-${String(idx).padStart(2, "0")}`; }
  return null;
}
function monthLabel(key: string): string { const [y, mm] = key.split("-"); return `${MONTHS[parseInt(mm, 10)] || mm} ${y}`; }

/** Normalised merchant/counterparty key: strip numbers/refs, keep first words. */
function nkey(desc: string): string {
  const clean = String(desc || "").toLowerCase().replace(/\b\d[\d,]*\b/g, " ").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.split(" ").filter(Boolean).slice(0, 4).join(" ");
}
function mode<T>(arr: T[]): T | undefined {
  const c = new Map<T, number>(); let best: T | undefined; let bn = 0;
  for (const x of arr) { const n = (c.get(x) || 0) + 1; c.set(x, n); if (n > bn) { bn = n; best = x; } }
  return best;
}

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
  if (!txns.length) return null;

  const ins = txns.filter((t) => t.direction === "in");
  const outs = txns.filter((t) => t.direction === "out");
  const inflow = ins.reduce((s, t) => s + t.amount, 0);
  const outflow = outs.reduce((s, t) => s + t.amount, 0);
  const net = inflow - outflow;
  const avgTxn = txns.length ? (inflow + outflow) / txns.length : 0;
  const netMarginPct = inflow > 0 ? Math.round((net / inflow) * 100) : null;

  // Spend by category
  const catMap: Record<string, number> = {};
  outs.forEach((t) => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
  const byCategory = Object.entries(catMap).map(([category, out]) => ({ category, outflow: out, share: outflow ? Math.round((out / outflow) * 100) : 0 })).sort((a, b) => b.outflow - a.outflow);
  const topCategoryShare = byCategory[0]?.share || 0;

  // Monthly trend
  const mMap = new Map<string, MonthPoint>();
  for (const t of txns) {
    const k = monthKey(t.date); if (!k) continue;
    const p = mMap.get(k) || { key: k, label: monthLabel(k), inflow: 0, outflow: 0, net: 0 };
    if (t.direction === "in") p.inflow += t.amount; else p.outflow += t.amount;
    p.net = p.inflow - p.outflow;
    mMap.set(k, p);
  }
  const monthly = [...mMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  // Recurring outflows (a payee seen 2+ times)
  const groups = new Map<string, Txn[]>();
  for (const t of outs) { const k = nkey(t.desc) || t.category.toLowerCase(); (groups.get(k) || groups.set(k, []).get(k)!).push(t); }
  const recurring: Recurring[] = [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => ({
      desc: mode(g.map((x) => x.desc)) || g[0].desc,
      count: g.length,
      total: g.reduce((s, x) => s + x.amount, 0),
      avg: g.reduce((s, x) => s + x.amount, 0) / g.length,
      category: mode(g.map((x) => x.category)) || g[0].category,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const recurringTotal = recurring.reduce((s, r) => s + r.total, 0);

  // Counterparties
  function parties(list: Txn[]): Party[] {
    const g = new Map<string, Txn[]>();
    for (const t of list) { const k = nkey(t.desc) || t.category.toLowerCase(); (g.get(k) || g.set(k, []).get(k)!).push(t); }
    return [...g.values()].map((arr) => ({ name: mode(arr.map((x) => x.desc)) || arr[0].desc, total: arr.reduce((s, x) => s + x.amount, 0), count: arr.length }))
      .sort((a, b) => b.total - a.total).slice(0, 6);
  }
  const counterpartiesOut = parties(outs);
  const counterpartiesIn = parties(ins);

  const topExpenses = [...outs].sort((a, b) => b.amount - a.amount).slice(0, 6).map((t) => ({ desc: t.desc, amount: t.amount, date: t.date, category: t.category }));
  const topInflows = [...ins].sort((a, b) => b.amount - a.amount).slice(0, 5).map((t) => ({ desc: t.desc, amount: t.amount, date: t.date }));

  const opening = raw.opening != null ? Number(raw.opening) : null;
  const closing = raw.closing != null ? Number(raw.closing) : null;
  const period = String(raw.period || "this period");

  // Burn / runway (only meaningful if cash-negative over 1+ months and we know closing)
  const monthsSpan = Math.max(1, monthly.length);
  const burnPerMonth = net < 0 ? Math.round(Math.abs(net) / monthsSpan) : null;
  const runwayMonths = burnPerMonth && closing != null && closing > 0 ? Math.round((closing / burnPerMonth) * 10) / 10 : null;

  // Health signals (deterministic)
  const signals: Signal[] = [];
  if (net < 0) signals.push({ label: "Cash-negative period", tone: "bad", detail: `You spent ${inr(Math.abs(net))} more than you brought in.` });
  else signals.push({ label: "Cash-positive period", tone: "good", detail: `You kept ${inr(net)} (${netMarginPct}% of inflow).` });
  if (topCategoryShare >= 40 && byCategory[0]) signals.push({ label: "Concentrated spend", tone: "warn", detail: `${topCategoryShare}% of outflow went to ${byCategory[0].category}.` });
  const charges = catMap["Bank Charges"] || 0;
  if (charges > 0) signals.push({ label: "Bank charges", tone: charges > outflow * 0.02 ? "warn" : "info", detail: `${inr(charges)} in bank charges this period — worth a review.` });
  if (recurringTotal > 0) signals.push({ label: "Recurring commitments", tone: "info", detail: `${inr(recurringTotal)} across ${recurring.length} repeat payees (EMIs, subscriptions, payroll).` });
  if (inflow === 0) signals.push({ label: "No credits detected", tone: "warn", detail: "No money came in this period — check the statement covers your collection account." });
  if (runwayMonths != null) signals.push({ label: "Runway", tone: runwayMonths < 3 ? "bad" : runwayMonths < 6 ? "warn" : "info", detail: `At this burn, closing balance lasts ~${runwayMonths} months.` });

  // Health score
  let score = 60;
  if (net >= 0) score += 20; else score -= 20;
  if (netMarginPct != null) score += Math.max(-10, Math.min(15, Math.round(netMarginPct / 5)));
  if (topCategoryShare < 40) score += 5; else score -= 5;
  if (charges > outflow * 0.02) score -= 5;
  score = Math.max(5, Math.min(98, score));
  const label = score >= 75 ? "Strong" : score >= 55 ? "Steady" : score >= 35 ? "Tight" : "Strained";

  const insights: string[] = Array.isArray(raw.insights) ? raw.insights.map((x: any) => String(x)).slice(0, 4) : [];

  const summaryMd = `## Cash summary — ${period}
- Money in: **${inr(inflow)}** across ${ins.length} credits
- Money out: **${inr(outflow)}** across ${outs.length} debits
- Net cash flow: **${net >= 0 ? "+" : "−"}${inr(Math.abs(net))}**${netMarginPct != null ? ` (${netMarginPct}% of inflow)` : ""}${closing != null ? `\n- Closing balance: **${inr(closing)}**` : ""}
- Cashflow health: **${label} (${score}/100)**${runwayMonths != null ? `\n- Runway at this burn: **~${runwayMonths} months**` : ""}

## Where the money went
${byCategory.slice(0, 6).map((c) => `- ${c.category}: ${inr(c.outflow)} (${c.share}%)`).join("\n") || "- (no debits found)"}
${monthly.length > 1 ? `\n## Month by month\n${monthly.map((m) => `- ${m.label}: in ${inr(m.inflow)} · out ${inr(m.outflow)} · net ${m.net >= 0 ? "+" : "−"}${inr(Math.abs(m.net))}`).join("\n")}` : ""}
${recurring.length ? `\n## Recurring payments\n${recurring.slice(0, 6).map((r) => `- ${r.desc} — ${inr(r.total)} over ${r.count} (${r.category})`).join("\n")}` : ""}

${insights.length ? `## What Cortex sees\n${insights.map((i) => `- ${i}`).join("\n")}` : ""}`.trim();

  return {
    currency: String(raw.currency || "INR"),
    period, count: txns.length, inflow, outflow, net, opening, closing,
    avgTxn, netMarginPct, topCategoryShare, burnPerMonth, runwayMonths,
    byCategory, monthly, recurring, counterpartiesOut, counterpartiesIn,
    topExpenses, topInflows, signals, health: { score, label }, insights, summaryMd, transactions: txns.length,
  };
}
