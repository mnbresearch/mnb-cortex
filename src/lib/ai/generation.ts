/**
 * Gemini generation settings, in one place.
 *
 * WHY THIS FILE EXISTS.
 *
 * Current Gemini Flash models think before they answer, and THINKING TOKENS ARE
 * BILLED AGAINST maxOutputTokens. A call that thinks for its whole budget has
 * nothing left and returns an EMPTY response — a documented failure mode of
 * Gemini 2.5/3 Flash, not a theoretical one.
 *
 * That was fixed in cortex.ts, and then six OTHER call sites turned out to be
 * making their own Gemini requests with their own hand-written config and no
 * thinking budget at all:
 *
 *     lib/ai/visibility.ts   900   and  1200
 *     lib/ai/act.ts          900
 *     lib/ai/priorities.ts   1024
 *     lib/ai/gst.ts          2048
 *     lib/ai/bankstatement.ts 4096
 *
 * visibility.ts is the one that matters most. It asks an answer engine whether
 * a business gets recommended, then checks whether the brand appears in the
 * reply. If thinking consumes the 900-token budget the reply comes back EMPTY,
 * the brand is not found in it, and the product tells the owner "ChatGPT does
 * not recommend you" — a false negative on the single number that feature
 * sells, indistinguishable from a true one.
 *
 * So the budget is no longer something each file invents. The profiles below
 * are chosen by what the call is FOR, and every one leaves the majority of its
 * budget for the answer after thinking is paid for.
 */

export type GenProfile = { maxOutputTokens: number; thinkingBudget: number };

/** Short, factual, and the user is waiting. */
export const FAST: GenProfile = { maxOutputTokens: 2048, thinkingBudget: 128 };
/** The default: considered, without an essay's worth of deliberation. */
export const STANDARD: GenProfile = { maxOutputTokens: 3072, thinkingBudget: 512 };
/** Multi-step reasoning where the thinking IS the value. */
export const DEEP: GenProfile = { maxOutputTokens: 4096, thinkingBudget: 2048 };
/**
 * Pulling structured data out of a document — a bank statement, a GST return.
 * These need ROOM, not deliberation: the work is transcription and arithmetic,
 * and the failure mode is running out of output halfway through a table. Giving
 * this DEEP's budget would have made it worse than before, because DEEP spends
 * half its allowance on thinking.
 */
export const EXTRACT: GenProfile = { maxOutputTokens: 8192, thinkingBudget: 256 };

const MODE_PROFILE: Record<string, GenProfile> = {
  pulse: FAST,
  actions: FAST,
  brief: FAST,
  critique: FAST,
  account: FAST,
  outreach: FAST,
  scenario: DEEP,
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
 * Build a Gemini `generationConfig`.
 *
 * `extra` merges in per-call settings (temperature, responseMimeType) without
 * letting a caller quietly drop the thinking budget again — that is the whole
 * point of routing every call through here.
 */
export function generationConfig(
  profile: GenProfile,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    maxOutputTokens: profile.maxOutputTokens,
    thinkingConfig: { thinkingBudget: profile.thinkingBudget },
  };
}

/**
 * True when a Gemini response came back OK but empty.
 *
 * Worth naming, because the cause is almost always thinking having eaten the
 * output budget, and the symptom — a successful HTTP call with no text — reads
 * like a network fault to anyone debugging it.
 */
export function describeEmptyResponse(json: any, profile: GenProfile): string {
  const reason = json?.candidates?.[0]?.finishReason || "unknown";
  return `model returned no text (finishReason=${reason}, maxOutputTokens=${profile.maxOutputTokens}, thinkingBudget=${profile.thinkingBudget})`;
}
