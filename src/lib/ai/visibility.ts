import { aiKey } from "@/lib/ai/byo";
// Cortex Visibility — Answer Engine Optimization (AEO) for SMEs.
// Runs real buyer-intent questions through AI answer engines, detects whether the
// brand (and competitors) get recommended, scores it, and drafts the fix.
import "server-only";
import { geminiTextModels } from "@/lib/ai/models";
import { generationConfig, STANDARD } from "@/lib/ai/generation";
import {
  findBrand, namedBrands, citations as readCitations, score as scoreOutcomes,
  brandAliases, tokens, type Citation, type Scores,
} from "@/lib/ai/visibility-match";

export type EngineResult = {
  prompt: string;
  answer: string;
  mentioned: boolean;
  position: number | null;
  /** Named, but not inside a ranked list — real, and weaker than a rank. */
  unranked: boolean;
  competitorsFound: string[];
  /** Every brand the answer named, whether or not the customer listed it. */
  brandsNamed: string[];
  citations: Citation[];
  engine: string;
};

export type EngineStat = {
  engine: string;
  grounded: boolean;
  prompts: number;
  mentions: number;
  /** False when this engine was tried and never answered — said, not hidden. */
  answered: boolean;
};

export type VisibilityReport = {
  brand: string;
  /** Share of answers naming the brand. Unchanged meaning from earlier runs. */
  score: number;
  scores: Scores;
  /** Summary engine label, or "none" when nothing answered at all. */
  engine: string;
  engines: EngineStat[];
  grounded: boolean;
  results: EngineResult[];
  competitors: { name: string; hits: number; supplied: boolean }[];
  citations: { domain: string; hits: number; url: string }[];
  missing: string[];
};

const NEUTRAL_SYSTEM =
  `You are a neutral, helpful assistant that people ask for recommendations. Answer the question naturally and specifically, naming real companies, brands or providers where relevant (list 5–8 named options when appropriate, best first). Do not add disclaimers or hedging.`;

type EngineAnswer = { answer: string; engine: string; grounded: boolean; chunks: any[] };
const NO_ANSWER: EngineAnswer = { answer: "", engine: "none", grounded: false, chunks: [] };

/* ---------------------------------------------------------------- engines */

async function askGemini(prompt: string): Promise<EngineAnswer> {
  const key = aiKey("GEMINI_API_KEY");
  if (!key) return NO_ANSWER;
  const model = geminiTextModels()[0];
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: NEUTRAL_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: generationConfig(STANDARD, { temperature: 0.3 }),
      }),
    });
    if (!r.ok) return NO_ANSWER;
    const j = await r.json();
    const cand = j?.candidates?.[0];
    const answer = (cand?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(" ").trim();
    if (!answer) return NO_ANSWER;
    /*
      The sources behind the answer. Previously discarded — see
      visibility-match.ts citations() for why that was the most expensive
      omission on this page.
    */
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    return { answer, engine: "Gemini · web-grounded", grounded: true, chunks };
  } catch { return NO_ANSWER; }
}

/**
 * OpenAI with live web search, via the Responses API.
 *
 * This is here because the module was sold, at one point, as checking
 * "ChatGPT and Perplexity" when it queried neither — the claim had to be
 * stripped. One real second engine is worth more than four claimed ones, and
 * cross-engine disagreement is the genuinely useful finding: a brand that
 * Gemini recommends and ChatGPT never mentions has a specific, fixable problem.
 *
 * If the model or the tool is unavailable on the customer's key this returns
 * no answer, and runVisibility() REPORTS that the engine did not answer rather
 * than quietly narrowing to one engine and letting the label imply otherwise.
 */
async function askOpenAI(prompt: string): Promise<EngineAnswer> {
  const key = aiKey("OPENAI_API_KEY");
  if (!key) return NO_ANSWER;
  const model = process.env.OPENAI_VISIBILITY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        instructions: NEUTRAL_SYSTEM,
        input: prompt,
        tools: [{ type: "web_search" }],
      }),
    });
    if (!r.ok) return NO_ANSWER;
    const j = await r.json();
    let answer = String(j?.output_text || "").trim();
    const chunks: any[] = [];
    for (const item of j?.output || []) {
      for (const c of item?.content || []) {
        if (!answer && c?.text) answer = String(c.text).trim();
        for (const a of c?.annotations || []) {
          if (a?.url) chunks.push({ web: { uri: a.url, title: a.title || "" } });
        }
      }
    }
    if (!answer) return NO_ANSWER;
    return { answer, engine: "ChatGPT · web search", grounded: true, chunks };
  } catch { return NO_ANSWER; }
}

/** Model knowledge only — no live web. Labelled as such, never as grounded. */
async function askGroq(prompt: string): Promise<EngineAnswer> {
  const key = aiKey("GROQ_API_KEY");
  if (!key) return NO_ANSWER;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: NEUTRAL_SYSTEM }, { role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!r.ok) return NO_ANSWER;
    const j = await r.json();
    const answer = (j?.choices?.[0]?.message?.content || "").trim();
    if (!answer) return NO_ANSWER;
    return { answer, engine: "Llama 3.3 · model knowledge", grounded: false, chunks: [] };
  } catch { return NO_ANSWER; }
}

type Engine = { id: string; ask: (p: string) => Promise<EngineAnswer> };

/** Grounded engines first: a live-web answer is the one a buyer would get. */
function availableEngines(): Engine[] {
  const out: Engine[] = [];
  if (aiKey("GEMINI_API_KEY")) out.push({ id: "gemini", ask: askGemini });
  if (aiKey("OPENAI_API_KEY")) out.push({ id: "openai", ask: askOpenAI });
  if (aiKey("GROQ_API_KEY")) out.push({ id: "groq", ask: askGroq });
  return out;
}

/* ------------------------------------------------------------- concurrency */

/**
 * Bounded-concurrency map.
 *
 * The old loop awaited each prompt in turn, so eight grounded searches cost
 * eight round trips end to end — twenty to forty seconds of the sixty this
 * route is allowed, for work that has no ordering requirement at all. Six at a
 * time keeps us inside provider rate limits while cutting the wall clock to
 * roughly the slowest wave.
 */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * How many prompts the SECOND engine cross-checks.
 *
 * Not all of them, deliberately. This action costs 89 credits against about
 * ₹12 of provider spend, and doubling the calls would halve a margin the
 * pricing model depends on. Four is enough to answer "do the engines agree?",
 * which is the question a second engine is actually for. Total calls stay at
 * twelve, so the cost line in config.ts remains true.
 */
const CROSS_CHECK = 4;

export function defaultPrompts(category: string, location: string): string[] {
  const cat = (category || "business").trim();
  const loc = location?.trim() ? ` in ${location.trim()}` : "";
  /*
    Buyer intent, not six rewordings of one question.
    The previous set asked "best", "reliable", "top", "trusted", "best-rated"
    and "which should I choose" — six near-identical phrasings that a model
    answers almost identically, so eight calls bought roughly one datum. These
    cover distinct intents, which is where engines genuinely diverge:
    discovery, local, alternatives, comparison, price, and trust.
  */
  return [
    `What are the best ${cat}${loc}?`,
    `Who are the most trusted ${cat}${loc}, and why?`,
    `I need a ${cat}${loc} — who should I contact first?`,
    `Which ${cat}${loc} offer the best value for money?`,
    `Recommend alternatives to the biggest ${cat}${loc}.`,
    `Compare the top ${cat}${loc} on quality and price.`,
    `Which ${cat}${loc} do businesses actually recommend?`,
    `Best ${cat}${loc} for a small business on a tight budget?`,
  ];
}

/**
 * @param opts.crossCheck how many prompts a SECOND engine re-asks. 0 disables it.
 *
 * Defaults to CROSS_CHECK for the paid route, and MUST be 0 for the public
 * one. /api/visibility/public is unauthenticated and free — a lead magnet —
 * and quietly adding a second engine there would have doubled the provider
 * spend on the one endpoint anybody on the internet can call in a loop. The
 * paid route absorbs the extra calls inside its 89 credits; the free one has
 * no such budget.
 */
export async function runVisibility(
  brand: string, competitors: string[], prompts: string[], limit = 8,
  opts: { crossCheck?: number } = {},
): Promise<VisibilityReport> {
  const clean = prompts.map((p) => p.trim()).filter(Boolean).slice(0, limit);
  const supplied = competitors.map((c) => c.trim()).filter(Boolean);
  const engines = availableEngines();
  const crossCheck = Math.max(0, opts.crossCheck ?? CROSS_CHECK);

  if (!engines.length || !clean.length) {
    return {
      brand, score: 0, engine: "none", engines: [], grounded: false, results: [],
      competitors: [], citations: [], missing: clean,
      scores: { presence: 0, prominence: 0, avgPosition: null, shareOfVoice: null },
    };
  }

  /* Primary engine answers every prompt; a second engine cross-checks a few. */
  const jobs: Array<{ prompt: string; engine: Engine }> = [];
  for (const p of clean) jobs.push({ prompt: p, engine: engines[0] });
  if (engines[1] && crossCheck > 0) for (const p of clean.slice(0, crossCheck)) jobs.push({ prompt: p, engine: engines[1] });

  const raw = await pool(jobs, 6, async (job) => ({ job, ans: await job.engine.ask(job.prompt) }));

  const results: EngineResult[] = [];
  const perEngine = new Map<string, EngineStat>();
  const tried = new Map<string, number>();
  for (const j of jobs) tried.set(j.engine.id, (tried.get(j.engine.id) || 0) + 1);

  const myAliases = new Set(brandAliases(brand).concat(tokens(brand).join(" ")));
  const discovered: Record<string, number> = {};
  const suppliedHits: Record<string, number> = {};
  const citeHits = new Map<string, { domain: string; hits: number; url: string }>();

  for (const { job, ans } of raw) {
    if (!ans.answer) continue;

    const hit = findBrand(ans.answer, brand);
    const named = namedBrands(ans.answer);
    const cites = readCitations(ans.chunks);

    /* Supplied competitors are matched with the same rigour as the brand, so a
       competitor called "Elite" is not credited to an "elite service". */
    const found = supplied.filter((c) => findBrand(ans.answer, c).mentioned);
    found.forEach((c) => { suppliedHits[c] = (suppliedHits[c] || 0) + 1; });

    /* Anything the answer named that is not us and not already supplied. */
    for (const n of named) {
      const norm = tokens(n).join(" ");
      if (!norm) continue;
      if ([...myAliases].some((a) => norm === a || norm.includes(a))) continue;
      if (supplied.some((s) => tokens(s).join(" ") === norm)) continue;
      discovered[n] = (discovered[n] || 0) + 1;
    }

    for (const c of cites) {
      const e = citeHits.get(c.domain);
      if (e) e.hits += 1;
      else citeHits.set(c.domain, { domain: c.domain, hits: 1, url: c.url });
    }

    const st = perEngine.get(ans.engine) || { engine: ans.engine, grounded: ans.grounded, prompts: 0, mentions: 0, answered: true };
    st.prompts += 1;
    if (hit.mentioned) st.mentions += 1;
    perEngine.set(ans.engine, st);

    results.push({
      prompt: job.prompt,
      answer: ans.answer,
      mentioned: hit.mentioned,
      position: hit.position,
      unranked: hit.unranked,
      competitorsFound: found,
      brandsNamed: named,
      citations: cites,
      engine: ans.engine,
    });
  }

  /*
    An engine that was tried and never answered is REPORTED. Silently dropping
    it would leave the summary label naming one engine while the customer
    believes two were checked — the same class of overclaim that had to be
    stripped from this module's marketing copy.
  */
  for (const [id, count] of tried) {
    const answered = raw.some((r) => r.job.engine.id === id && r.ans.answer);
    if (!answered) {
      const label = id === "gemini" ? "Gemini" : id === "openai" ? "ChatGPT" : "Llama 3.3";
      perEngine.set(`${label} · no answer`, { engine: `${label} · no answer`, grounded: false, prompts: count, mentions: 0, answered: false });
    }
  }

  if (!results.length) {
    return {
      brand, score: 0, engine: "none", engines: [...perEngine.values()], grounded: false, results: [],
      competitors: [], citations: [], missing: clean,
      scores: { presence: 0, prominence: 0, avgPosition: null, shareOfVoice: null },
    };
  }

  /* Score on the PRIMARY engine's answers only. Mixing a four-prompt
     cross-check into an eight-prompt run would make the headline number depend
     on which engines happened to be configured, so it could not be compared
     with the same workspace's previous run. */
  const primaryLabel = results.find((r) => r.engine !== "none")?.engine ?? "none";
  const primary = results.filter((r) => r.engine === primaryLabel);

  const scores = scoreOutcomes(primary.map((r) => ({
    mentioned: r.mentioned,
    position: r.position,
    competitors: r.competitorsFound.concat(r.brandsNamed.filter((n) => !r.competitorsFound.includes(n))),
  })));

  const competitorsAgg = [
    ...Object.entries(suppliedHits).map(([name, hits]) => ({ name, hits, supplied: true })),
    ...Object.entries(discovered).map(([name, hits]) => ({ name, hits, supplied: false })),
  ].sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name));

  return {
    brand,
    score: scores.presence,
    scores,
    engine: [...perEngine.values()].filter((e) => e.answered).map((e) => e.engine).join(" + ") || "none",
    engines: [...perEngine.values()],
    grounded: [...perEngine.values()].some((e) => e.grounded),
    results,
    competitors: competitorsAgg.slice(0, 12),
    citations: [...citeHits.values()].sort((a, b) => b.hits - a.hits).slice(0, 12),
    missing: primary.filter((r) => !r.mentioned).map((r) => r.prompt),
  };
}

/** Draft the AEO fix — content designed to get the brand recommended by AI engines. */
export async function draftAeoFix(
  brand: string, category: string, location: string, missing: string[],
  context?: { competitors?: { name: string; hits: number }[]; citations?: { domain: string; hits: number }[] },
): Promise<string> {
  const sys = `You are an Answer Engine Optimization (AEO) specialist. Businesses want AI assistants (ChatGPT, Gemini, Perplexity, Google AI Overviews) to recommend them when buyers ask for suggestions. Be specific, concrete and India-aware.`;

  /*
    The fix now sees WHO is winning and WHERE the answers came from. Advice
    written without those is generic AEO boilerplate; advice that can say "the
    engines cited justdial and indiamart, and named Deccan Spares four times"
    tells the owner which two listings to fix this week.
  */
  const comps = (context?.competitors || []).slice(0, 8);
  const cites = (context?.citations || []).slice(0, 8);
  const ask = `Brand: ${brand}
Category: ${category || "—"}${location ? `\nLocation: ${location}` : ""}
Buyer questions it is currently NOT recommended for:
${missing.length ? missing.map((m) => `- ${m}`).join("\n") : "- (none — it was named in every answer)"}
${comps.length ? `\nRecommended instead, with how often:\n${comps.map((c) => `- ${c.name} (${c.hits}×)`).join("\n")}` : ""}
${cites.length ? `\nSources the AI answers actually cited:\n${cites.map((c) => `- ${c.domain} (${c.hits}×)`).join("\n")}` : ""}

Give a short, prioritised plan to get this brand named in those answers. Lead with the cited sources above — being present and accurate on the pages AI already reads is faster than creating anything new. Be concrete about what to publish or claim, and where. No preamble.`;

  const key = aiKey("GEMINI_API_KEY");
  if (!key) return "";
  const model = geminiTextModels()[0];
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: ask }] }],
        generationConfig: generationConfig(STANDARD, { temperature: 0.4 }),
      }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(" ").trim();
  } catch { return ""; }
}
