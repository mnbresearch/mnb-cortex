import { CREDIT_COSTS, CREDIT_PACKS, PLANS, PLAN_CREDITS } from "@/lib/config";

/**
 * Unit economics for every metered action.
 *
 * WHY THIS EXISTS, AND WHY THE OLD ARITHMETIC WAS WRONG.
 *
 * config.ts prices actions "at the ₹0.90 credit floor", taking the cheapest
 * credit PACK (10,000 for ₹8,999) as the worst case. But credits also arrive
 * through PLANS, and the plans are far cheaper per credit:
 *
 *     AI COO annual     ₹3,99,990/yr = ₹33,332/mo for 60,000 credits = ₹0.556
 *     Business annual   ₹1,49,990/yr = ₹12,499/mo for 20,000 credits = ₹0.625
 *     AI COO monthly    ₹39,999/mo               for 60,000 credits = ₹0.667
 *
 * So the true floor is ₹0.556, and every margin in this product was being
 * computed against a number 1.62x too generous. An action believed to be
 * running at 75% margin was actually at 59%; one believed to be at 65% was
 * losing money on an annual AI COO account — which is precisely the customer
 * who uses the product most.
 *
 * creditFloor() is therefore COMPUTED from the packs and plans rather than
 * typed in. Add a cheaper plan, or raise a plan's credit allowance, and the
 * floor moves on its own and the margin test re-checks every action against it.
 * That is the only version of this that stays true.
 *
 * ---------------------------------------------------------------------------
 * THE COGS NUMBERS BELOW ARE ASSUMPTIONS. Change them here when the real
 * invoice says otherwise; everything else recomputes and the test re-verifies.
 * They are deliberately PESSIMISTIC: worst-case token usage at the
 * post-promotional model price, because a margin that only holds while a
 * discount lasts is not a margin.
 * ---------------------------------------------------------------------------
 */

/** Conservative. A weaker rupee raises COGS, so rounding up protects margin. */
export const USD_INR = 90;

/**
 * Output price per 1M tokens for the text model actually serving traffic.
 *
 * config.ts records gemini-3.7-flash at $3.75 promotional, rising to $7.50 when
 * the promotion ends on 31 Dec 2026. The POST-promotional figure is used here:
 * pricing the product on a discount that expires means repricing every customer
 * the day it does.
 */
export const MODEL_OUTPUT_USD_PER_1M = 7.50;

/**
 * Input price per 1M tokens. Input is cheaper than output but not free, and the
 * business snapshot plus recalled memory makes these prompts large — several
 * thousand tokens before the user has typed anything.
 */
export const MODEL_INPUT_USD_PER_1M = 0.60;

/** Worst-case input tokens: system prompt + business snapshot + memory recall. */
export const WORST_CASE_INPUT_TOKENS = 8000;

/**
 * Output-token ceilings, mirroring the profiles in lib/ai/generation.ts.
 *
 * Duplicated deliberately: generation.ts is server-only and this module is not,
 * so importing it here would drag server code into any client bundle that wants
 * to show pricing. scripts/test-margins.mjs asserts the two agree, the same way
 * the SQL and TypeScript name-normalisers are held together.
 */
export const PROFILE_OUTPUT_TOKENS = {
  FAST: 2048,
  STANDARD: 3072,
  DEEP: 4096,
  EXTRACT: 8192,
} as const;

/** Which profile each metered mode runs on. Must match generation.ts MODE_PROFILE. */
export const MODE_PROFILE_NAME: Record<string, keyof typeof PROFILE_OUTPUT_TOKENS> = {
  pulse: "FAST", actions: "FAST", brief: "FAST", critique: "FAST", account: "FAST",
  outreach: "FAST", act: "FAST", gbp: "FAST",
  scenario: "DEEP", forecast: "DEEP", strategy: "DEEP", investor: "DEEP",
  board: "DEEP", valuation: "DEEP", deepdive: "DEEP", report: "DEEP",
  gst: "EXTRACT", bankstatement: "EXTRACT",
};

/**
 * Actions whose cost is NOT token-based. Rupees per call, from the provider's
 * own per-unit pricing rather than an estimate.
 */
export const FIXED_COGS_INR: Record<string, number> = {
  /** One Gemini image generation. */
  agent_image: 3.74,
  /**
   * One 8-second Veo clip on the Fast tier ($0.10/s). The Standard tier is
   * $0.40/s — about ₹306 — which is the bill that made a 40-credit video a
   * ₹270 loss on every clip. If VEO_RESOLUTION is set to 1080p the duration is
   * forced to 8 seconds, so this figure is already the 1080p-Fast worst case.
   */
  agent_video: 77,
  /**
   * AI Visibility runs several grounded searches, not one call, and Google
   * Search grounding is billed separately from tokens.
   */
  visibility: 12,
};

/* -------------------------------------------------------------------------- */

/** ₹ per credit, worst case, across every way a customer can obtain credits. */
export function creditFloor(): { value: number; source: string } {
  let best: { value: number; source: string } | null = null;

  for (const p of CREDIT_PACKS) {
    const v = p.price / p.credits;
    if (!best || v < best.value) best = { value: v, source: `pack ${p.id}` };
  }

  for (const plan of PLANS) {
    const credits = PLAN_CREDITS[plan.id];
    if (!credits || credits < 0) continue;          // unlimited/enterprise is priced by hand
    for (const [label, monthly] of [
      ["monthly", plan.monthly],
      ["annual", plan.annual / 12],
    ] as const) {
      if (!monthly) continue;                        // custom-priced
      const v = monthly / credits;
      if (!best || v < best.value) best = { value: v, source: `${plan.id} ${label}` };
    }
  }

  return best || { value: 0.9, source: "fallback" };
}

/** What one call of `mode` costs us, in rupees, worst case. */
export function cogsInr(mode: string): number {
  const fixed = FIXED_COGS_INR[mode];
  if (fixed != null) return fixed;

  const profile = MODE_PROFILE_NAME[mode] || "STANDARD";
  const outTokens = PROFILE_OUTPUT_TOKENS[profile];
  const outInr = (outTokens / 1_000_000) * MODEL_OUTPUT_USD_PER_1M * USD_INR;
  const inInr = (WORST_CASE_INPUT_TOKENS / 1_000_000) * MODEL_INPUT_USD_PER_1M * USD_INR;
  return outInr + inInr;
}

export type ModeMargin = {
  mode: string;
  credits: number;
  revenueInr: number;
  cogsInr: number;
  marginPct: number;
  /** Credits needed to reach the target margin, rounded up. */
  creditsForTarget: number;
};

/** Margin for one mode at the worst-case credit value. */
export function marginFor(mode: string, target = 0.85): ModeMargin {
  const floor = creditFloor().value;
  const credits = CREDIT_COSTS[mode] ?? 2;
  const revenue = credits * floor;
  const cogs = cogsInr(mode);
  const marginPct = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : -100;
  // revenue must be cogs / (1 - target)
  const creditsForTarget = Math.ceil(cogs / (1 - target) / floor);
  return { mode, credits, revenueInr: revenue, cogsInr: cogs, marginPct, creditsForTarget };
}

/** Every metered mode, worst margin first. */
export function allMargins(target = 0.85): ModeMargin[] {
  return Object.keys(CREDIT_COSTS)
    .map((m) => marginFor(m, target))
    .sort((a, b) => a.marginPct - b.marginPct);
}
