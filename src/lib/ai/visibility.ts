// Cortex Visibility — Answer Engine Optimization (AEO) for SMEs.
// Runs real buyer-intent questions through AI answer engines, detects whether the
// brand (and competitors) get recommended, scores it, and drafts the fix.
import "server-only";
import { geminiTextModels } from "@/lib/ai/models";
import { generationConfig, FAST, STANDARD, EXTRACT } from "@/lib/ai/generation";

export type EngineResult = {
  prompt: string;
  answer: string;
  mentioned: boolean;
  position: number | null;
  competitorsFound: string[];
  engine: string;
};

export type VisibilityReport = {
  brand: string;
  score: number;
  engine: string;
  grounded: boolean;
  results: EngineResult[];
  competitors: { name: string; hits: number }[];
  missing: string[];
};

const NEUTRAL_SYSTEM =
  `You are a neutral, helpful assistant that people ask for recommendations. Answer the question naturally and specifically, naming real companies, brands or providers where relevant (list 5–8 named options when appropriate, best first). Do not add disclaimers or hedging.`;

/** Ask one answer engine. Prefers Gemini with Google Search grounding (live web); falls back to Groq (model knowledge). */
async function askEngine(prompt: string): Promise<{ answer: string; engine: string; grounded: boolean }> {
  if (process.env.GEMINI_API_KEY) {
    const model = geminiTextModels()[0];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: NEUTRAL_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: generationConfig(STANDARD, { temperature: 0.3 }),
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const answer = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(" ").trim();
        if (answer) return { answer, engine: "Gemini · web-grounded", grounded: true };
      }
    } catch { /* fall through */ }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: NEUTRAL_SYSTEM }, { role: "user", content: prompt }], temperature: 0.3 }),
      });
      if (r.ok) { const j = await r.json(); const answer = (j?.choices?.[0]?.message?.content || "").trim(); if (answer) return { answer, engine: "Llama 3.3 · model knowledge", grounded: false }; }
    } catch { /* fall through */ }
  }
  return { answer: "", engine: "none", grounded: false };
}

function detect(answer: string, brand: string): { mentioned: boolean; position: number | null } {
  if (!answer || !brand) return { mentioned: false, position: null };
  const a = answer.toLowerCase();
  const b = brand.toLowerCase().trim();
  const idx = a.indexOf(b);
  if (idx < 0) return { mentioned: false, position: null };
  const before = answer.slice(0, idx);
  const numbered = (before.match(/\n\s*\d+[.)]/g) || []).length;
  const bulleted = (before.match(/\n\s*[-*•]/g) || []).length;
  const rank = Math.max(numbered, bulleted) + 1;
  return { mentioned: true, position: rank };
}

export function defaultPrompts(category: string, location: string): string[] {
  const cat = (category || "business").trim();
  const loc = location?.trim() ? ` in ${location.trim()}` : "";
  return [
    `What are the best ${cat}${loc}?`,
    `Recommend a reliable ${cat}${loc}.`,
    `Who are the top ${cat} companies${loc}?`,
    `I'm looking for a trusted ${cat}${loc} — any suggestions?`,
    `Best-rated ${cat}${loc} for a small business?`,
    `Which ${cat}${loc} should I choose, and why?`,
  ];
}

export async function runVisibility(brand: string, competitors: string[], prompts: string[], limit = 8): Promise<VisibilityReport> {
  const clean = prompts.map((p) => p.trim()).filter(Boolean).slice(0, limit);
  const comps = competitors.map((c) => c.trim()).filter(Boolean);
  const results: EngineResult[] = [];
  let engine = "none"; let grounded = false;

  for (const p of clean) {
    const { answer, engine: e, grounded: g } = await askEngine(p);
    engine = e !== "none" ? e : engine;
    grounded = grounded || g;
    const { mentioned, position } = detect(answer, brand);
    const competitorsFound = comps.filter((c) => answer.toLowerCase().includes(c.toLowerCase()));
    results.push({ prompt: p, answer, mentioned, position, competitorsFound, engine: e });
  }

  const shown = results.filter((r) => r.mentioned).length;
  const score = results.length ? Math.round((shown / results.length) * 100) : 0;
  const compCount: Record<string, number> = {};
  results.forEach((r) => r.competitorsFound.forEach((c) => { compCount[c] = (compCount[c] || 0) + 1; }));
  const competitorsAgg = Object.entries(compCount).map(([name, hits]) => ({ name, hits })).sort((a, b) => b.hits - a.hits);
  const missing = results.filter((r) => !r.mentioned).map((r) => r.prompt);

  return { brand, score, engine, grounded, results, competitors: competitorsAgg, missing };
}

/** Draft the AEO fix — content designed to get the brand recommended by AI engines. */
export async function draftAeoFix(brand: string, category: string, location: string, missing: string[]): Promise<string> {
  const sys = `You are an Answer Engine Optimization (AEO) specialist. Businesses want AI assistants (ChatGPT, Gemini, Perplexity, Google AI Overviews) to recommend them when buyers ask for suggestions. Be specific, concrete and India-aware.`;
  const ask = `Brand: ${brand}
Category: ${category || "—"}${location ? `\nLocation: ${location}` : ""}
Buyer questions it is currently NOT recommended for:
${missing.map((m) => `- ${m}`).join("\n") || "- (appears in most answers already)"}

Write a fix plan in markdown with exactly these sections:
## Why you're being missed
2–3 crisp reasons AI engines don't cite ${brand} yet.
## FAQs to publish
5 question→answer pairs (the answer written so an AI can quote it verbatim and recommend ${brand}).
## Your AI-ready "About" blurb
A 3–4 sentence description of ${brand}, optimised to be quoted.
## Off-site moves this month
3 concrete actions (directories, review sites, mentions, structured data) that make AI engines trust and cite ${brand}.`;

  // Reuse the same providers directly (neutral AEO persona, not the COO persona).
  if (process.env.GEMINI_API_KEY) {
    const model = geminiTextModels()[0];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: ask }] }], generationConfig: generationConfig(STANDARD, { temperature: 0.5 }) }),
      });
      if (r.ok) { const j = await r.json(); const t = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(" ").trim(); if (t) return t; }
    } catch { /* fall through */ }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: sys }, { role: "user", content: ask }], temperature: 0.5 }),
      });
      if (r.ok) { const j = await r.json(); const t = (j?.choices?.[0]?.message?.content || "").trim(); if (t) return t; }
    } catch { /* fall through */ }
  }
  return "";
}
