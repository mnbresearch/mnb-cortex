import "server-only";
import { geminiTextModels } from "@/lib/ai/models";

// "What should I do next?" — the guided command layer that turns 130+ tools into
// the 3–5 that matter for THIS business right now. Grounded in the workspace's
// real data + Cortex Memory. Rules/setup fallbacks so it always returns something.

export type Priority = { title: string; why: string; tool: string; href: string; urgency: "high" | "medium" | "low" };

// The menu the model may route to — keeps every link valid.
const TOOLS: Record<string, { label: string; href: string }> = {
  bank: { label: "Bank Statement Intelligence", href: "/bank" },
  gst: { label: "GST Return Reader", href: "/gst-reader" },
  import: { label: "Import data", href: "/import" },
  chat: { label: "Ask Cortex", href: "/chat" },
  deepdive: { label: "Cortex Deep Dive", href: "/deepdive" },
  runway: { label: "Cash Runway", href: "/runway" },
  cash13: { label: "13-week Cash Flow", href: "/cash13" },
  receivables: { label: "Receivables & DSO", href: "/receivables" },
  payables: { label: "Payables & DPO", href: "/payables" },
  pricing: { label: "Pricing Optimizer", href: "/pricing-optimizer" },
  discount: { label: "Discount Impact", href: "/discount" },
  reorder: { label: "Reorder Optimizer", href: "/reorder" },
  funnel: { label: "Marketing Funnel", href: "/funnel" },
  pipeline: { label: "Deals Pipeline", href: "/pipeline" },
  churn: { label: "Churn Predictor", href: "/churn" },
  ltv: { label: "Customer LTV", href: "/ltv" },
  visibility: { label: "AI Visibility", href: "/visibility" },
  act: { label: "AI Outreach", href: "/act" },
  costs: { label: "Cost Optimizer", href: "/costs" },
  forecast: { label: "Forecasting", href: "/forecast" },
  report: { label: "Executive Report", href: "/reports" },
};

const SETUP: Priority[] = [
  { title: "Add your real numbers", why: "Upload a bank statement and Cortex reads your true cash position in seconds.", tool: TOOLS.bank.label, href: TOOLS.bank.href, urgency: "high" },
  { title: "Read your latest GST return", why: "Get your turnover, tax split, ITC and net payable — no spreadsheets.", tool: TOOLS.gst.label, href: TOOLS.gst.href, urgency: "medium" },
  { title: "Ask how your business is doing", why: "Ask in plain language once data is in — Cortex answers from your numbers.", tool: TOOLS.chat.label, href: TOOLS.chat.href, urgency: "medium" },
  { title: "See if AI recommends you", why: "Check whether ChatGPT & Gemini name your business to buyers.", tool: TOOLS.visibility.label, href: TOOLS.visibility.href, urgency: "low" },
];

const RULES: Priority[] = [
  { title: "Run a Deep Dive on cash", why: "Get a root-cause read and a costed 30-day plan for your cash position.", tool: TOOLS.deepdive.label, href: TOOLS.deepdive.href, urgency: "high" },
  { title: "Chase your overdue invoices", why: "See a chase-first list ranked by amount and days overdue.", tool: TOOLS.receivables.label, href: TOOLS.receivables.href, urgency: "high" },
  { title: "Check your runway", why: "Know how many months of cash you have at the current burn.", tool: TOOLS.runway.label, href: TOOLS.runway.href, urgency: "medium" },
  { title: "Ask Cortex what to fix first", why: "A grounded answer on the single highest-impact move this week.", tool: TOOLS.chat.label, href: TOOLS.chat.href, urgency: "medium" },
];

function safeArray(t: string): any[] | null {
  if (!t) return null;
  let s = t.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try { const j = JSON.parse(s); return Array.isArray(j) ? j : (Array.isArray(j?.actions) ? j.actions : null); } catch {}
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) { try { const j = JSON.parse(s.slice(a, b + 1)); return Array.isArray(j) ? j : null; } catch {} }
  return null;
}

async function callJson(prompt: string, sys: string): Promise<any[] | null> {
  if (process.env.GEMINI_API_KEY) {
    const model = geminiTextModels()[0];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" } }),
      });
      if (r.ok) { const j = await r.json(); const t = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(""); const parsed = safeArray(t); if (parsed) return parsed; }
    } catch { /* fall through */ }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: sys }, { role: "user", content: prompt }], temperature: 0.2, response_format: { type: "json_object" } }),
      });
      if (r.ok) { const j = await r.json(); const t = j?.choices?.[0]?.message?.content || ""; const parsed = safeArray(t); if (parsed) return parsed; }
    } catch { /* fall through */ }
  }
  return null;
}

export async function buildPriorities(context: string, hasData: boolean): Promise<{ priorities: Priority[]; mode: "setup" | "ai" | "rules" }> {
  if (!hasData) return { priorities: SETUP, mode: "setup" };

  const menu = Object.entries(TOOLS).map(([k, v]) => `${k} = ${v.label}`).join("; ");
  const sys = `You are an AI COO for an Indian SME. Return ONLY a JSON array, no prose, no code fences.`;
  const prompt = `From this business's live data, choose the 3-5 MOST IMPORTANT actions the owner should take this week, ordered most urgent first.
Return a JSON array of objects EXACTLY like:
[{"title":"imperative, max 8 words","why":"one specific sentence, cite a real number from the data when possible","tool":"one key from the menu","urgency":"high|medium|low"}]
Tool menu (use the KEY on the left): ${menu}
Rules: pick the tool that best helps do each action; do not invent tools; base every "why" on the data below; no generic filler.

BUSINESS DATA:
${context.slice(0, 6000)}`;

  const raw = await callJson(prompt, sys);
  if (!raw || !raw.length) return { priorities: RULES, mode: "rules" };

  const out: Priority[] = [];
  for (const r of raw) {
    const key = String(r?.tool || "").toLowerCase().trim();
    const t = TOOLS[key];
    if (!t) continue;
    const urgency = ["high", "medium", "low"].includes(String(r?.urgency)) ? r.urgency : "medium";
    const title = String(r?.title || "").slice(0, 80).trim();
    const why = String(r?.why || "").slice(0, 200).trim();
    if (!title) continue;
    out.push({ title, why, tool: t.label, href: t.href, urgency });
    if (out.length >= 5) break;
  }
  return out.length ? { priorities: out, mode: "ai" } : { priorities: RULES, mode: "rules" };
}
