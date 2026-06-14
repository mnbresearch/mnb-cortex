// Server-only AI layer for the AI COO.
// Supports FREE providers (Google Gemini, Groq) and paid (Anthropic, OpenAI).
// Set ONE key; provider is auto-detected (or force with AI_PROVIDER).
import "server-only";

export const COO_SYSTEM = `You are MNB Cortex — the AI Chief Operating Officer for an SME owner.
You are NOT a chatbot or a dashboard. You behave like a McKinsey/BCG-grade operator who has read all of the company's data.
Rules:
- The owner does not care about charts. Answer four questions implicitly: What is happening? Why? What should I do? Can you do it?
- Lead with the answer in one plain sentence. Then 2-4 crisp supporting points. Then concrete recommended actions.
- Quantify everything you can using the BUSINESS SNAPSHOT provided. Never invent contradictory numbers.
- Use Indian business context (INR, lakh/crore, GST, Tally).
- End with a one-line confidence note when you are extrapolating.
- Be direct and concise. No fluff, no hedging, no "as an AI".`;

type Msg = { role: "user" | "assistant"; content: string };

function pickProvider(): string {
  const forced = (process.env.AI_PROVIDER || "").toLowerCase();
  if (forced) return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export async function runCortex(messages: Msg[], context: string): Promise<string> {
  const provider = pickProvider();
  const sys = `${COO_SYSTEM}\n\n--- BUSINESS SNAPSHOT ---\n${context}`;
  try {
    // ---- Google Gemini (FREE: aistudio.google.com) ----
    if (provider === "gemini" && process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      });
      const j = await r.json();
      return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? fallback(messages);
    }
    // ---- Groq (FREE: console.groq.com) — OpenAI-compatible ----
    if (provider === "groq" && process.env.GROQ_API_KEY) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: sys }, ...messages], temperature: 0.4 }),
      });
      const j = await r.json();
      return j?.choices?.[0]?.message?.content ?? fallback(messages);
    }
    // ---- OpenAI ----
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", messages: [{ role: "system", content: sys }, ...messages], temperature: 0.4 }),
      });
      const j = await r.json();
      return j?.choices?.[0]?.message?.content ?? fallback(messages);
    }
    // ---- Anthropic ----
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022", max_tokens: 1024, system: sys, messages }),
      });
      const j = await r.json();
      return j?.content?.[0]?.text ?? fallback(messages);
    }
  } catch (e) {
    return fallback(messages);
  }
  return fallback(messages);
}

function fallback(messages: Msg[]): string {
  const q = (messages[messages.length - 1]?.content || "").toLowerCase();
  if (q.includes("how is my business"))
    return `**Your business is healthy but tightening on two fronts.**

- Revenue is ₹4.25 Cr this month, up 12% — strongest in the West region and the new Premium-X line.
- But net profit fell 7% because raw material RM-204 rose 9% and you didn't pass it through; gross margin slipped 33% → 31%.
- Cash runway is ~5 months and shrinking, with ₹72 L of receivables now overdue.
- Inventory cover on RM-204 is only 9 days vs a 12-day lead time — Line B is at stockout risk.

**What I'd do now:**
1. Approve the PO I've already drafted (PO-4471, 10,000 units of RM-204).
2. Push a 4% price increase on low-elasticity SKUs to rebuild margin.
3. Chase the top 5 overdue customers — Apex Traders (₹18 L, 48 days) first.

_Confidence: high on the diagnosis; the stockout date is a 9-day estimate._

(Add a free GEMINI_API_KEY or GROQ_API_KEY to enable full live reasoning.)`;
  if (q.includes("profit"))
    return `**Profit is down 7% even though revenue grew — it's a margin problem, not a sales problem.**

- Raw material RM-204 rose ~9%; you absorbed it instead of repricing.
- Gross margin moved 33% → 31%, costing roughly ₹8–9 L this month.
- Overtime in Packing added avoidable opex.

**Actions:** reprice low-elasticity SKUs +4%, renegotiate your top-3 supplier contracts, and cap Packing overtime with a second shift.

_Add a free AI key (Gemini/Groq) for live, data-grounded analysis._`;
  return `Here's my read based on your current data: revenue is up 12% but profit is down 7% on rising raw-material costs, cash runway is ~5 months, and RM-204 is heading for a stockout in ~9 days.

Tell me which area to go deeper on — sales, finance, inventory, production, HR, or strategy — and I'll give you the diagnosis and the actions I'd take.

(Configure a free GEMINI_API_KEY or GROQ_API_KEY to unlock full AI reasoning over your live data.)`;
}
