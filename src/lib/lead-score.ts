/**
 * Deterministic lead scoring for the sales pipeline.
 *
 * The landing page and /features both sold "Pipeline + AI Lead Scoring — an
 * AI-ranked pipeline that tells you who to chase". /pipeline was a plain
 * kanban; a repo-wide grep for `score` returned nothing.
 *
 * This is deliberately arithmetic rather than an LLM call:
 *   - it costs nothing and never rate-limits,
 *   - it is stable (the same deal doesn't jump ranks between page loads),
 *   - and every score can be explained in one line, which is what actually
 *     makes a rep trust it.
 */

export type Deal = {
  id?: string;
  deal_name?: string | null;
  customer_name?: string | null;
  stage?: string | null;
  value?: number | null;
  probability?: number | null;   // 0..1
  created_at?: string | null;
  updated_at?: string | null;
};

export type ScoredDeal = Deal & {
  score: number;          // 0..100
  band: "hot" | "warm" | "cold";
  expected: number;       // value × probability, in rupees
  ageDays: number;
  why: string;            // one line the rep can argue with
};

/** How far through the funnel each stage is. Unknown stages sit mid-table. */
const STAGE_WEIGHT: Record<string, number> = {
  lead: 0.15, new: 0.15, prospect: 0.25, qualified: 0.4, contacted: 0.3,
  demo: 0.55, proposal: 0.7, quote: 0.7, negotiation: 0.85, won: 1, closed: 1, lost: 0,
};

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/**
 * Score one deal against the largest deal in the pipeline, so "big" is relative
 * to this business rather than an absolute rupee threshold that would rank a
 * ₹50k pipeline as universally cold.
 */
export function scoreDeal(d: Deal, maxExpected: number): ScoredDeal {
  const value = num(d.value);
  const stage = String(d.stage || "").toLowerCase().trim();
  // Trust an explicit probability; otherwise infer it from the stage.
  const stageW = STAGE_WEIGHT[stage] ?? 0.35;
  const prob = d.probability !== null && d.probability !== undefined ? Math.min(1, Math.max(0, num(d.probability))) : stageW;
  const expected = value * prob;
  const ageDays = daysSince(d.updated_at || d.created_at);

  // 1. Size — expected value relative to the biggest deal on the board (0..55)
  const sizePts = maxExpected > 0 ? (expected / maxExpected) * 55 : 0;
  // 2. Progress — how far down the funnel it already is (0..30)
  const stagePts = stageW * 30;
  // 3. Freshness — a deal untouched for a month is going cold (0..15)
  const freshPts = ageDays <= 7 ? 15 : ageDays <= 21 ? 10 : ageDays <= 45 ? 5 : 0;

  const score = Math.round(Math.min(100, sizePts + stagePts + freshPts));
  const band: ScoredDeal["band"] = score >= 65 ? "hot" : score >= 35 ? "warm" : "cold";

  const bits: string[] = [];
  if (expected > 0) bits.push(`${inr(expected)} expected (${inr(value)} × ${Math.round(prob * 100)}%)`);
  if (stage) bits.push(`at ${stage}`);
  if (ageDays > 45) bits.push(`untouched ${ageDays}d — going cold`);
  else if (ageDays > 21) bits.push(`${ageDays}d since last activity`);
  else if (ageDays <= 7) bits.push("active this week");

  return { ...d, score, band, expected, ageDays, why: bits.join(" · ") || "No value or stage set yet" };
}

/** Score and rank a pipeline, hottest first. Lost deals are dropped. */
export function scorePipeline(deals: Deal[]): ScoredDeal[] {
  const live = (deals || []).filter((d) => String(d.stage || "").toLowerCase() !== "lost");
  const expectations = live.map((d) => {
    const stageW = STAGE_WEIGHT[String(d.stage || "").toLowerCase()] ?? 0.35;
    const prob = d.probability ?? stageW;
    return num(d.value) * Math.min(1, Math.max(0, num(prob)));
  });
  const maxExpected = expectations.length ? Math.max(...expectations) : 0;
  return live.map((d) => scoreDeal(d, maxExpected)).sort((a, b) => b.score - a.score);
}

/** Headline numbers for the top of the pipeline page. */
export function pipelineSummary(scored: ScoredDeal[]) {
  const weighted = scored.reduce((a, d) => a + d.expected, 0);
  const gross = scored.reduce((a, d) => a + num(d.value), 0);
  return {
    count: scored.length,
    gross,
    weighted,
    hot: scored.filter((d) => d.band === "hot").length,
    stale: scored.filter((d) => d.ageDays > 45).length,
  };
}
