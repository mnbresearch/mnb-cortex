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

// ---- Streaming (OpenAI-compatible providers: Groq/OpenAI); others fall back to one chunk ----
export async function streamCortex(messages: Msg[], context: string): Promise<ReadableStream<Uint8Array>> {
  const provider = pickProvider();
  const sys = `${COO_SYSTEM}\n\n--- BUSINESS SNAPSHOT ---\n${context}`;
  const enc = new TextEncoder();
  const openaiLike =
    (provider === "groq" && process.env.GROQ_API_KEY) ? { url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY!, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" } :
    (provider === "openai" && process.env.OPENAI_API_KEY) ? { url: "https://api.openai.com/v1/chat/completions", key: process.env.OPENAI_API_KEY!, model: process.env.OPENAI_MODEL || "gpt-4o-mini" } : null;

  if (openaiLike) {
    try {
      const upstream = await fetch(openaiLike.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiLike.key}` },
        body: JSON.stringify({ model: openaiLike.model, stream: true, temperature: 0.4, messages: [{ role: "system", content: sys }, ...messages] }),
      });
      if (!upstream.ok || !upstream.body) throw new Error("stream failed");
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          let buf = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split("\n"); buf = lines.pop() || "";
              for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith("data:")) continue;
                const data = t.slice(5).trim();
                if (data === "[DONE]") { controller.close(); return; }
                try { const j = JSON.parse(data); const d = j.choices?.[0]?.delta?.content; if (d) controller.enqueue(enc.encode(d)); } catch {}
              }
            }
          } catch {}
          controller.close();
        },
      });
    } catch { /* fall through */ }
  }
  const full = await runCortex(messages, context);
  return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(full)); c.close(); } });
}

export async function generateReport(context: string): Promise<string> {
  const prompt = `Write a concise but complete monthly business review (MIS) for the owner, using ONLY the snapshot below.
Structure with these markdown sections:
## Executive summary
## What's working
## What's at risk
## Key numbers
## Recommended actions (this week)
Be specific, quantify with INR (lakh/crore), and keep it board-ready.`;
  return runCortex([{ role: "user", content: prompt }], context);
}

const MODE_PROMPTS: Record<string, string> = {
  document: `You are analyzing a business document for an SME owner. Produce markdown with:
## Summary (3-4 lines)
## Key figures & terms
## Risks & red flags (bullets)
## Suggested next steps
Document content follows:`,
  meeting: `You are a meeting assistant. From the transcript/notes produce markdown with:
## Summary
## Decisions made
## Action items (format: Owner — task — due)
## Follow-ups
Transcript/notes follow:`,
  market: `You are a McKinsey market analyst for an Indian SME. For the question produce markdown with:
## Market size & growth
## Competitor landscape
## Entry barriers
## Pricing guidance
## Recommended strategy
Use realistic estimates; state assumptions. Question:`,
  strategy: `You are a McKinsey/BCG strategy consultant. For the question produce markdown with:
## MECE issue tree
## Key hypotheses
## SWOT
## Recommended roadmap (with KPIs)
Ground it in the BUSINESS SNAPSHOT. Question:`,
  outreach: `You are a B2B sales copywriter for an Indian SME. Write ready-to-send outreach for the described customer/opportunity. Produce markdown with:
## WhatsApp message (short, friendly)
## Cold email (subject + 4-6 line body)
## Follow-up line
Keep it specific and India-appropriate. Details:`,
  pulse: `Give a 3-sentence executive pulse on the business RIGHT NOW: (1) what's happening, (2) the single biggest risk, (3) the one action to take today. Be specific with numbers.`,
  forecast: `You are a CFO-grade financial forecaster for an Indian SME. Using the BUSINESS SNAPSHOT, produce a forward-looking forecast in markdown with:
## 90-day outlook (revenue, profit, cash)
## Cash runway & the month it gets tight
## Key assumptions
## Leading indicators to watch
## What to do now to change the trajectory
Quantify in INR (lakh/crore). State confidence. Context/question (may be blank):`,
  scenario: `You are the AI COO stress-testing a decision for an Indian SME owner. Analyse the described scenario against the BUSINESS SNAPSHOT. Produce markdown with:
## Bottom line (one sentence: do it / don't / do it with conditions)
## Impact on profit, cash & runway (quantified)
## Best case / base case / worst case
## Risks & how to de-risk
## Verdict & conditions
Scenario:`,
  benchmark: `You are a benchmarking analyst for Indian SMEs. Compare this company (from the BUSINESS SNAPSHOT) to typical peers in its sector. Produce markdown with:
## Where you beat the benchmark
## Where you lag (and by how much)
## Peer-median vs you (table: metric | you | peer median | gap)
## The 3 gaps worth closing first
Use realistic Indian SME benchmarks; state that they are estimates. Focus area (may be blank):`,
  actions: `You are the AI COO. From the BUSINESS SNAPSHOT, generate a prioritised action list the owner can execute this week. Produce markdown with a single ordered list; for EACH action use the exact format:
**[P1|P2|P3] Action title** — why it matters (1 line) — expected impact (₹ or %) — owner/module.
Order by impact-to-effort. Give 6-9 actions. Be concrete and numeric.`,
  pricing: `You are a pricing strategist for an Indian SME (GST-aware). Using the BUSINESS SNAPSHOT, recommend pricing moves. Produce markdown with:
## Margin diagnosis
## Recommended price changes (by SKU/segment, with %)
## Elasticity & competitor risk
## Expected margin & revenue impact (quantified)
## Rollout plan (comms + timing)
Consider GST and the recent competitor price cut. Details (may be blank):`,
  negotiate: `You are a procurement/negotiation coach for an Indian SME. For the supplier/customer situation, produce markdown with:
## Your leverage & their leverage
## Target, walk-away & opening position (numbers)
## Talk track (3-4 lines you can say)
## Concessions to trade (low-cost to you)
## BATNA
Ground it in the BUSINESS SNAPSHOT where relevant. Situation:`,
  risk: `You are a risk officer for an Indian SME. From the BUSINESS SNAPSHOT, build a risk radar. Produce markdown with a table: Risk | Likelihood (H/M/L) | Impact (H/M/L) | Early warning sign | Mitigation. Cover cash, supply chain, customer concentration, margin, people, and market risks. Then a one-line "biggest risk right now".`,
  hiring: `You are a workforce/org-design advisor for an Indian SME. Using the BUSINESS SNAPSHOT, produce markdown with:
## Should you hire now? (yes/no + why, tied to cash runway)
## Roles that would create the most value (ranked)
## Cost vs. expected return per role (INR)
## Alternatives to hiring (automation, contractors)
Question (may be blank):`,
  brief: `You are the AI COO writing the owner's daily brief. Using the BUSINESS SNAPSHOT, produce a tight markdown brief with:
## Good morning — the one thing that matters today
## 3 numbers to know
## 2 risks on the horizon
## Your 3 moves today
Keep it under 200 words, specific and numeric.`,
  gst: `You are a GST & compliance assistant for an Indian SME (not a substitute for a CA). For the question, produce markdown with:
## Short answer
## How it applies here (rates, ITC, place of supply as relevant)
## Filing / due-date implications (GSTR-1, GSTR-3B, etc.)
## What to do next
State clearly that this is general guidance, and to confirm edge cases with a chartered accountant. Question:`,
};

export async function generateFor(mode: string, input: string, context: string): Promise<string> {
  const p = MODE_PROMPTS[mode] || MODE_PROMPTS.pulse;
  const user = mode === "pulse" ? p : `${p}\n\n${input}`;
  return runCortex([{ role: "user", content: user }], context);
}
