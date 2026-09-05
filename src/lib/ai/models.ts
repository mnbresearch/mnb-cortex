/**
 * Gemini model names, in one place.
 *
 * The whole AI layer was dead in production because `gemini-2.0-flash` was
 * hardcoded in three files and Google shut it down:
 *
 *   404 — "This model models/gemini-2.0-flash is no longer available."
 *
 * Every chat, report, Deep Dive and agent call failed, and the retry wrapper
 * reported it as "the engine is busy (rate limit)" so nobody could tell.
 *
 * Two defences here:
 *   1. One list, not three copies.
 *   2. CANDIDATES, not a single name — the caller walks the list on a 404, so a
 *      future retirement degrades to the next model instead of taking the
 *      product down. Set GEMINI_MODEL to pin one explicitly.
 */

/** Text/reasoning models, best first. Verified against ai.google.dev. */
export function geminiTextModels(): string[] {
  const pinned = (process.env.GEMINI_MODEL || "").trim();
  // COST ORDER, verified against production — not assumed.
  //
  // gemini-2.5-flash looked ideal on paper ($0.30/$2.50 per 1M) but returns 404
  // on this API key, so it is REMOVED: leaving it first meant every single call
  // paid a wasted round-trip before falling through. That is the cost of
  // choosing a model from a pricing page instead of testing it.
  //
  // Output price per 1M tokens, which dominates for this workload. Re-checked
  // against ai.google.dev/gemini-api/docs/pricing on 5 Sep 2026:
  //   gemini-3.8-flash  $0.75 in / $3.75 out  (promotional until 31 Dec 2026)
  //   gemini-3.7-flash  $0.75 / $3.75         (same promotional pricing)
  //   gemini-3.6-flash  $0.75 / $3.75         (same)
  //   gemini-3.5-flash  $1.50 / $9.00         (known-good on this key — the safety net)
  //
  // 3.8 leads because it is Google's newest STABLE Flash and is priced
  // identically to 3.7 and 3.6 — strictly better output at the same cost, so
  // there is no trade to make. It was missing from this list simply because it
  // shipped after the list was written, which is the failure mode CANDIDATES
  // exists to survive in the other direction.
  //
  // ALL THREE PROMOTIONAL PRICES DOUBLE ON 1 JANUARY 2027 ($1.50 / $7.50).
  // scripts/test-margins.mjs already costs the product at the post-promotional
  // rate, so the 85% floor holds through that date without a repricing — do not
  // "optimise" the margin model back onto the discounted figure.
  //
  // /api/health names whichever one actually answers, so a silent fallback to
  // the expensive end is visible rather than invisible.
  const fallbacks = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
  ];
  return pinned ? [pinned, ...fallbacks.filter((m) => m !== pinned)] : fallbacks;
}

/** Image generation/editing models, best first. */
export function geminiImageModels(): string[] {
  const pinned = (process.env.GEMINI_IMAGE_MODEL || "").trim();
  const fallbacks = [
    "gemini-2.5-flash-image",   // "Nano Banana", stable
    "gemini-3.1-flash-image",   // "Nano Banana 2", stable
  ];
  return pinned ? [pinned, ...fallbacks.filter((m) => m !== pinned)] : fallbacks;
}

export const geminiUrl = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
