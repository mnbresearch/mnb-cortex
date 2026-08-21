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
  // COST ORDER, not capability order. Per ai.google.dev (Aug 2026), output
  // tokens cost $9.00/M on gemini-3.5-flash against $2.50/M on 2.5-flash — a
  // typical grounded chat is ₹0.88 versus ₹0.22, four times the price for
  // reasoning over the customer's own figures that 2.5-flash does perfectly
  // well. At the old 1-credit charge, 3.5-flash left literally no margin.
  // Set GEMINI_MODEL to pin a stronger model for a premium tier.
  const fallbacks = [
    "gemini-2.5-flash",     // stable, $0.30/$2.50 per 1M — the workhorse
    "gemini-3.5-flash",     // stronger, $1.50/$9.00 — fallback only
    "gemini-flash-latest",  // alias — always resolves to something live
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
