// Server-only AI layer for the AI COO.
// Supports FREE providers (Google Gemini, Groq) and paid (Anthropic, OpenAI).
// Set ONE key; provider is auto-detected (or force with AI_PROVIDER).
import "server-only";
import { anyEnvKey, envKey } from "@/lib/env";
import { geminiTextModels, geminiUrl } from "@/lib/ai/models";

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

/**
 * Set once if a Gemini model rejects thinkingConfig, so the whole process stops
 * sending a field that model will not accept. See the 400 handling in runOnce().
 */
let thinkingUnsupported = false;

/* ---------------------------------------------------------------------------
   GENERATION PROFILES — why the AI took 28-39 seconds to write three sentences.

   Measured against a real workspace, the dashboard pulse took 27.9s and 38.9s.
   The prompt for it asks for "a 3-sentence executive pulse". Three sentences.

   The cause is that current Gemini Flash models THINK before they answer, and
   nothing here told them not to. Every call — a three-sentence pulse and a
   full strategic deep dive alike — was sent with the same config and an
   unbounded thinking budget, so the model reasoned at length before emitting a
   word the user would ever see.

   Two things follow, and the second is a correctness bug rather than a speed
   one:

   1. THINKING TOKENS ARE BILLED AGAINST maxOutputTokens. With the old cap of
      1024, a model that thinks for 1024 tokens has nothing left and returns an
      EMPTY response. That is a documented failure mode of Gemini 2.5/3 Flash,
      not a theoretical one, and it would present as the AI silently returning
      nothing on exactly the hardest questions — the ones worth thinking about.
      The caps below are raised so the answer always has room after the
      thinking is paid for.

   2. Not every question deserves the same deliberation. A pulse wants speed; a
      deep dive or a scenario stress-test genuinely benefits from reasoning.
      So the budget is per-mode instead of one setting for everything.

   NOTE ON thinkingBudget = 0: Gemini 3 Flash and Flash-Lite do NOT support
   turning thinking off completely, so the fast profile asks for a small budget
   rather than zero. Asking for zero on a model that refuses it would be a 400
   on every call — see the fallback in runOnce().
   --------------------------------------------------------------------------- */
export type GenProfile = { maxOutputTokens: number; thinkingBudget: number };

/** Short, factual, wanted now. */
const FAST: GenProfile = { maxOutputTokens: 2048, thinkingBudget: 128 };
/** The default: a considered answer without an essay's worth of deliberation. */
const STANDARD: GenProfile = { maxOutputTokens: 3072, thinkingBudget: 512 };
/** Multi-step reasoning where the thinking IS the value. */
const DEEP: GenProfile = { maxOutputTokens: 4096, thinkingBudget: 2048 };

const MODE_PROFILE: Record<string, GenProfile> = {
  pulse: FAST,          // 3 sentences on the dashboard — the one users wait on
  actions: FAST,
  brief: FAST,
  critique: FAST,
  account: FAST,
  outreach: FAST,
  scenario: DEEP,       // stress-testing a decision
  forecast: DEEP,
  strategy: DEEP,
  investor: DEEP,
  board: DEEP,
  valuation: DEEP,
};

export function profileFor(mode: string): GenProfile {
  return MODE_PROFILE[mode] || STANDARD;
}

/**
 * Every configured provider, best first — not just the first match.
 *
 * This used to return ONE provider and there was no failover, so a GROQ_API_KEY
 * sitting in the environment could never be reached while GEMINI_API_KEY
 * existed. Gemini was a hard single point of failure: rate-limit it or revoke
 * the key and every AI feature in the product went down until a human edited an
 * env var and redeployed. With a chain, a second free key is genuine redundancy.
 *
 * AI_PROVIDER still forces one provider, for debugging or to pin cost.
 */
function providerChain(): string[] {
  const forced = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  if (forced) return [forced];
  const chain: string[] = [];
  if (envKey("GEMINI_API_KEY")) chain.push("gemini");
  if (envKey("GROQ_API_KEY")) chain.push("groq");
  if (envKey("ANTHROPIC_API_KEY")) chain.push("anthropic");
  if (envKey("OPENAI_API_KEY")) chain.push("openai");
  return chain.length ? chain : ["none"];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Why the last provider call failed. Every failure used to collapse into the
 * same "the engine is busy (rate limit)" message, so a dead API key, a retired
 * model name and a genuine 429 were indistinguishable — in production the AI
 * was down and nothing said why.
 */
type ProviderFailure = { provider: string; status?: number; detail: string };
let lastFailure: ProviderFailure | null = null;

/** Human-readable cause of the most recent failure, for the user-facing message. */
function describeFailure(f: ProviderFailure | null): string {
  if (!f) return "The AI provider did not respond.";
  if (f.status === 429) return "The AI provider is rate-limiting us right now.";
  if (f.status === 401 || f.status === 403) return `The ${f.provider} API key is invalid or has no access (HTTP ${f.status}).`;
  if (f.status === 404) return `The configured ${f.provider} model was not found (HTTP 404) — it may have been retired. Set ${f.provider.toUpperCase()}_MODEL to a current model.`;
  if (f.status && f.status >= 500) return `The ${f.provider} service is failing (HTTP ${f.status}).`;
  if (f.status) return `${f.provider} returned HTTP ${f.status}.`;
  return `Could not reach ${f.provider}: ${f.detail}`;
}

/** True when at least one AI provider key is configured. */
export function hasAIKey(): boolean {
  return anyEnvKey("GROQ_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY");
}

/**
 * Runs the model with retry/backoff on transient failures (429 rate-limit, 5xx).
 * Providers rate-limit under bursty load; without this the app silently returned
 * an off-topic canned answer, which is worse than an honest "try again".
 */
export async function runCortex(messages: Msg[], context: string, profile: GenProfile = STANDARD): Promise<string> {
  if (!hasAIKey()) return fallback(messages); // genuinely unconfigured — show the setup hint

  // The workspace's own instructions, resolved HERE because every AI feature in
  // the product funnels through this function — chat, agents, reports, Deep
  // Dive, the nightly autopilot. Injecting once means a customer writes their
  // house style, vocabulary and priorities in one place and every answer
  // changes, instead of us threading a parameter through thirty call sites and
  // missing some.
  //
  // Best-effort: a workspace we can't resolve (the cron has no session) simply
  // gets the default behaviour rather than an error.
  let context2 = context;
  try {
    const { getUserAndOrg } = await import("@/lib/data");
    const { getInstructions, instructionBlock } = await import("@/lib/ai-instructions");
    const { orgId } = await getUserAndOrg();
    const extra = instructionBlock(await getInstructions(orgId));
    if (extra) context2 = `${context}${extra}`;
  } catch { /* no session or no table — carry on with defaults */ }

  for (const provider of providerChain()) {
    // Retry the SAME provider only for genuinely transient trouble. A 429 is not
    // transient on this timescale: free-tier quotas reset on a 60-second window,
    // so three retries 3.5 seconds apart cannot clear it and each one spends
    // another request from an already-exhausted budget, deepening the outage for
    // everyone else. Auth and model errors won't fix themselves either. In all
    // three cases the right move is to hand over to the next provider at once.
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
      const out = await runOnce(provider, messages, context2, profile);
      if (out !== null) return out;

      const st = lastFailure?.status;
      const worthRetrying = !st || st >= 500;   // network blip or provider 5xx
      if (!worthRetrying) break;                // 429 / 401 / 403 / 404 → next provider
      if (i < attempts - 1) await sleep(500 * Math.pow(2, i) + Math.random() * 250);
    }
    // fall through to the next configured provider
  }

  return `I couldn't reach the AI engine. ${describeFailure(lastFailure)}\n\nYour data is safe and nothing was lost — please try again shortly, or check the AI provider settings.`;
}

/** One model call. Returns null on a transient/failed call so the caller can retry. */
async function runOnce(provider: string, messages: Msg[], context: string, profile: GenProfile): Promise<string | null> {
  const sys = `${COO_SYSTEM}\n\n--- BUSINESS SNAPSHOT ---\n${context}`;
  try {
    // ---- Google Gemini (FREE: aistudio.google.com) ----
    if (provider === "gemini" && envKey("GEMINI_API_KEY")) {
      const buildBody = (withThinking: boolean) => JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: profile.maxOutputTokens,
          ...(withThinking ? { thinkingConfig: { thinkingBudget: profile.thinkingBudget } } : {}),
        },
      });
      // Walk the candidate models: a 404 means that name was retired, so try
      // the next one rather than taking the whole product down.
      for (const model of geminiTextModels()) {
        let r = await fetch(geminiUrl(model, process.env.GEMINI_API_KEY!), {
          method: "POST", headers: { "Content-Type": "application/json" }, body: buildBody(!thinkingUnsupported),
        });

        /*
          thinkingConfig is not accepted by every Gemini model, and Gemini
          rejects unknown generationConfig fields outright rather than ignoring
          them. Sending it blindly would therefore turn a latency optimisation
          into a total AI outage on any model that does not support it.

          So a 400 that names the field is treated as "this model does not take
          that setting" and retried once without it. The result is remembered
          for the life of the process, so the product pays this probe at most
          once rather than on every single call.
        */
        if (r.status === 400 && !thinkingUnsupported) {
          const detail = await r.clone().text().catch(() => "");
          if (/thinking|unknown name|invalid json payload|unrecognized/i.test(detail)) {
            console.warn(`[cortex] ${model} rejected thinkingConfig; retrying without it and disabling for this process.`);
            thinkingUnsupported = true;
            r = await fetch(geminiUrl(model, process.env.GEMINI_API_KEY!), {
              method: "POST", headers: { "Content-Type": "application/json" }, body: buildBody(false),
            });
          }
        }

        if (r.ok) {
          const j = await r.json();
          const text = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
          /*
            An OK response with no text is the thinking-ate-the-budget case:
            the model spent maxOutputTokens reasoning and had none left to
            answer with. Retrying the same call would just do it again, so say
            so in the logs — silence here used to look like a network fault.
          */
          if (!text) {
            const reason = j?.candidates?.[0]?.finishReason || "unknown";
            console.error(`[cortex] ${model} returned no text (finishReason=${reason}, maxOutputTokens=${profile.maxOutputTokens}, thinkingBudget=${profile.thinkingBudget}).`);
          }
          return text;
        }
        await note(`gemini(${model})`, r);
        if (r.status !== 404) break; // a real error — don't burn the other models
      }
      return null;
    }
    // ---- Groq (FREE: console.groq.com) — OpenAI-compatible ----
    if (provider === "groq" && process.env.GROQ_API_KEY) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: sys }, ...messages], temperature: 0.4 }),
      });
      if (!r.ok) return await note("groq", r); // 429 rate-limit or 5xx → let the caller retry
      const j = await r.json();
      return j?.choices?.[0]?.message?.content ?? null;
    }
    // ---- OpenAI ----
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", messages: [{ role: "system", content: sys }, ...messages], temperature: 0.4 }),
      });
      if (!r.ok) return await note("openai", r);
      const j = await r.json();
      return j?.choices?.[0]?.message?.content ?? null;
    }
    // ---- Anthropic ----
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022", max_tokens: 1024, system: sys, messages }),
      });
      if (!r.ok) return await note("anthropic", r);
      const j = await r.json();
      return j?.content?.[0]?.text ?? null;
    }
  } catch (e: any) {
    lastFailure = { provider, detail: e?.message || "network error" };
    console.error("[cortex] provider call threw", lastFailure);
    return null; // network/transient — retry
  }
  lastFailure = { provider, detail: provider === "none" ? "no provider key configured" : "no matching provider branch" };
  return null;
}

/** Record an upstream non-OK response, log it, and signal a retry. */
async function note(provider: string, r: Response): Promise<null> {
  let detail = "";
  try { detail = (await r.text()).slice(0, 300); } catch { /* body already consumed */ }
  lastFailure = { provider, status: r.status, detail };
  // Surfaces in the Vercel runtime logs, which is the only place this was
  // ever going to be diagnosable from.
  console.error(`[cortex] ${provider} HTTP ${r.status}: ${detail}`);
  return null;
}

/**
 * Shown only when NO AI provider key is configured at all.
 *
 * This used to answer with specific invented financials — "Revenue is ₹4.25 Cr
 * this month", "Apex Traders ₹18 L, 48 days overdue" — presented as the
 * reader's own business. An SME owner acting on fabricated numbers is a
 * liability, not a demo, and it directly contradicted the guard in
 * getBusinessContext() that tells the model never to invent figures.
 *
 * It now says plainly that the AI is not configured, and nothing else.
 */
function fallback(_messages: Msg[]): string {
  return `**The AI engine isn't configured yet, so I can't analyse your business.**

No AI provider key is set on this deployment, which means I have no model to reason with — and I'm not going to make up numbers about your company.

To switch me on, add one of these to your environment and redeploy:

- \`GEMINI_API_KEY\` — free at [aistudio.google.com](https://aistudio.google.com/apikey), no card required
- \`GROQ_API_KEY\` — free at [console.groq.com](https://console.groq.com/keys)
- \`OPENAI_API_KEY\` or \`ANTHROPIC_API_KEY\` if you'd rather use a paid provider

Everything else in Cortex — your dashboard, imports and the 50+ calculators — works without it.`;
}

// ---- Streaming (OpenAI-compatible providers: Groq/OpenAI); others fall back to one chunk ----
export async function streamCortex(messages: Msg[], context: string): Promise<ReadableStream<Uint8Array>> {
  // Genuine token streaming only exists for the OpenAI-compatible providers, so
  // look for one ANYWHERE in the chain rather than only at its head. Previously
  // this read the single top provider: with Gemini configured it was never
  // OpenAI-compatible, so /api/chat/stream always fell through to one blocking
  // call emitted as a single chunk — the user watched an empty box for the whole
  // generation. With a Groq key present the reply now actually streams.
  const chain = providerChain();
  const provider = chain.find((c) => (c === "groq" && process.env.GROQ_API_KEY) || (c === "openai" && process.env.OPENAI_API_KEY)) || chain[0];
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
  investor: `You are writing a monthly investor / board update for an Indian SME, using the BUSINESS SNAPSHOT. Produce a crisp, confident markdown update with:
## TL;DR (3 bullets)
## Financials (revenue, margin, profit, cash — with % changes)
## Highlights this month
## Challenges & how we're addressing them
## Asks (if any)
## Next month's focus
Board-ready, honest, quantified in INR (lakh/crore). Extra context (may be blank):`,
  marketing: `You are a growth marketer for an Indian SME. For the campaign/goal described, produce ready-to-use markdown with:
## Positioning angle
## 3 WhatsApp/SMS messages (short)
## 2 social captions (LinkedIn + Instagram)
## 1 promotional email (subject + body)
## Suggested offer & target segment
Keep it India-appropriate, specific, and tied to the business where relevant. Brief:`,
  competitor: `You are a competitive-intelligence analyst for an Indian SME. For the competitor(s)/market described, produce markdown with:
## Competitor snapshot (positioning, likely pricing, strengths)
## Where they beat us / where we beat them
## Their likely next move
## How we should respond (specific plays)
## What to monitor
Ground it in the BUSINESS SNAPSHOT (e.g. the rival's recent 8% price cut). Details:`,
  loan: `You are a CFO advising an Indian SME owner on debt/funding. Using the BUSINESS SNAPSHOT (cash runway ~5 months), assess the loan/funding described. Produce markdown with:
## Should you take it? (yes / no / yes-with-conditions)
## Impact on cash & runway (quantified, INR)
## Can you service the EMI? (coverage vs monthly profit)
## Cheaper / smarter alternatives
## If you proceed — terms to negotiate
Be direct and numeric. Details:`,
  vendor: `You are a procurement analyst for an Indian SME. Build a supplier/vendor scorecard for the vendor(s) described. Produce markdown with:
## Scorecard (table: criterion | rating /5 | note) covering price, quality, reliability, lead time, terms, risk
## Overall verdict
## Red flags
## Actions (renegotiate, add backup, consolidate)
Ground it in the BUSINESS SNAPSHOT where relevant (e.g. RM-204 single-source risk). Details:`,
  sop: `You are an operations expert writing a Standard Operating Procedure (SOP) for an Indian SME. For the process described, produce a clear markdown SOP with:
## Purpose
## Scope & owner
## Step-by-step procedure (numbered, specific)
## Checks & controls
## What "good" looks like (KPIs)
Keep it practical for a small team. Process:`,
  broadcast: `You are a WhatsApp marketing copywriter for an Indian SME. For the campaign/segment described, write a broadcast in markdown with:
## Primary message (WhatsApp-ready, warm, <400 chars, 1 emoji max)
## Variant B (different angle)
## Follow-up nudge (1 line, for non-responders)
## Best send time & segment note
Keep it India-appropriate, personal, and compliant (clear opt-out). Campaign:`,
  board: `You are preparing a board meeting for an Indian SME, using the BUSINESS SNAPSHOT. Produce a slide-by-slide deck in markdown. For EACH slide use:
### Slide N — Title
- 3-5 tight bullets (quantified in INR where relevant)
Cover: 1 Agenda, 2 Executive summary, 3 Financials, 4 Growth, 5 Risks, 6 Operations, 7 Asks & decisions, 8 Next quarter. Board-ready and honest. Extra context (may be blank):`,
  costs: `You are a cost-optimization consultant for an Indian SME. Using the BUSINESS SNAPSHOT, find savings without hurting growth. Produce markdown with:
## Quick wins (0-30 days, with ₹ estimates)
## Structural savings (renegotiations, mix, automation)
## What NOT to cut (protect these)
## Total realistic annual saving (INR)
Prioritise by rupee impact and ease. Focus area (may be blank):`,
  proposal: `You are writing a client-ready proposal for an Indian professional-services firm. From the brief, produce a polished markdown proposal with:
## Understanding of your requirement
## Proposed scope of work (phased, with deliverables)
## Timeline (weeks, with milestones)
## Commercials (itemised, in INR, with payment schedule)
## Why us
## Assumptions & exclusions
## Next steps
Be specific and confident; never invent client facts not given. Brief:`,
  valuation: `You are a valuation analyst for an Indian SME. Interpret the valuation inputs and outputs provided. Produce markdown with:
## What this business is plausibly worth (range, INR)
## Which method fits best here and why
## What's driving / dragging the multiple
## How to increase valuation over 12-24 months (ranked)
## Caveats a buyer will raise
Be realistic about Indian SME multiples and state that this is indicative, not a formal valuation. Inputs:`,
  critique: `You are a sharp but constructive devil's advocate for an SME owner. For the decision described, produce markdown with:
## Steelman — the strongest case FOR this decision
## The 3 risks you're most likely underweighting
## What would have to be true for this to work
## Cheaper or more reversible alternatives
## If you proceed anyway — how to de-risk it
Be direct and specific, ground it in the BUSINESS SNAPSHOT, and don't hedge. Decision:`,
  contract: `You are a commercial contracts reviewer for an Indian SME (not a lawyer, and you say so). Review the clause/contract text provided. Produce markdown with:
## Plain-English summary
## Your obligations & key dates
## Red flags & risky clauses (with why)
## Missing protections you'd want
## Questions to raise / edits to request
Flag anything about liability, indemnity, termination, payment terms, IP, non-compete, auto-renewal and penalties. End by noting this is general guidance, not legal advice — confirm with a lawyer. Text:`,
  account: `You are a key-account manager for an Indian SME. For the customer described, build an account plan in markdown with:
## Account snapshot & relationship health
## Whitespace — what more we could sell them
## Risks (churn signals, concentration, payment)
## The next 3 moves to grow this account
## A short, ready-to-send check-in message
Ground it in the BUSINESS SNAPSHOT where relevant. Customer details:`,
};

export async function generateFor(mode: string, input: string, context: string): Promise<string> {
  const p = MODE_PROMPTS[mode] || MODE_PROMPTS.pulse;
  const user = mode === "pulse" ? p : `${p}\n\n${input}`;
  // Per-mode budget: a 3-sentence pulse must not deliberate like a deep dive.
  return runCortex([{ role: "user", content: user }], context, profileFor(mode));
}

// ---- Cortex Deep Dive: a chained, multi-pass analysis (agentic) --------------
export type DeepDiveSection = { key: string; title: string; body: string };

const FOCUS_LABELS: Record<string, string> = {
  finance: "cash, margin and overall financial health",
  sales: "sales, pipeline and revenue growth",
  pricing: "pricing and margin optimisation",
  marketing: "marketing, demand generation and ROAS",
  inventory: "inventory, stock levels and procurement",
  receivables: "receivables, collections and DSO",
  payables: "payables, suppliers and working capital",
  costs: "cost structure and where to cut without hurting growth",
  customers: "customers, retention and churn",
  people: "team, hiring, productivity and retention",
  operations: "operations, production and delivery",
  product: "product mix, portfolio and what to push or drop",
  growth: "expansion into new markets, channels or segments",
  competition: "competitive positioning and threats",
  risk: "risks, exposure and what could go wrong",
  capital: "fundraising, debt and investor readiness",
  compliance: "GST, statutory obligations and compliance",
  exports: "export potential and international opportunity",
  efficiency: "automation, process and operational efficiency",
  strategy: "overall strategy and where to grow next",
};

/**
 * Runs a 3-pass reasoning chain (diagnose → decide → execute), each pass grounded
 * in the same business snapshot + memory and building on the previous pass's output.
 * This is deliberately "deeper" than a single-shot mode: the model reasons over its
 * own conclusions before recommending and drafting the first action.
 */
export async function runDeepDive(focus: string, question: string, context: string): Promise<DeepDiveSection[]> {
  const label = FOCUS_LABELS[focus] || FOCUS_LABELS.finance;
  const topic = question.trim() ? question.trim() : label;
  const sections: DeepDiveSection[] = [];

  // Pass 1 — Diagnose
  const diagnosis = await runCortex([{ role: "user", content:
`Run a deep diagnostic on ${topic}. Use ONLY the business snapshot; quantify in INR (lakh/crore). Markdown, no preamble:
## What's happening
2–4 sharp, quantified observations.
## Why it's happening
The root causes, ranked, and mechanical (which SKU, cost, customer or process). Keep it tight.` }], context);
  sections.push({ key: "diagnosis", title: "Situation & root cause", body: diagnosis });

  // Pass 2 — Decide (reasons over the diagnosis)
  const options = await runCortex([{ role: "user", content:
`This is your diagnosis of ${topic}:

${diagnosis}

Now make the call. Markdown:
## Options
Exactly three options. For each: the upside, the risk, and the rough INR impact.
## Recommendation
Pick ONE and justify it in two lines.` }], context);
  sections.push({ key: "options", title: "Options & recommendation", body: options });

  // Pass 3 — Execute (reasons over diagnosis + recommendation)
  const plan = await runCortex([{ role: "user", content:
`Diagnosis and recommendation for ${topic}:

${diagnosis}

${options}

Turn the recommendation into execution. Markdown:
## 30-day plan
A week-by-week plan. For each week: the action, the owner, and the metric that proves it worked.
## First action, drafted
Write the single highest-impact artifact to start now — an email, WhatsApp message, or purchase order — fully written and ready to send or approve.` }], context);
  sections.push({ key: "plan", title: "30-day plan & first action", body: plan });

  return sections;
}
