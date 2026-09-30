/**
 * The default model for each non-Google provider — in one place, because two
 * of them had quietly died.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * These defaults were written inline at eight call sites, and nothing checked
 * them. scripts/test-models.mjs curates a live/retired list and prints "all
 * live as of 2026-09-05" — but it only ever looked at Google's models. The
 * other three providers were never in scope, so their defaults rotted in
 * silence:
 *
 *   claude-3-5-sonnet-20241022   retired by Anthropic on 28 October 2025.
 *                                Every request returns an error.
 *
 *   llama-3.3-70b-versatile      decommissioned by Groq on 16 August 2026 —
 *                                six weeks ago. Returns 404 "does not exist
 *                                or you do not have access to it". This was
 *                                the default at SIX call sites: priorities,
 *                                gst, visibility, act, bankstatement, cortex.
 *
 * Both are reached through bring-your-own-key, which is a sold feature. A
 * customer who pastes a valid Groq or Anthropic key and does not also set a
 * model environment variable gets a hard failure on every AI action — from a
 * key that is perfectly good.
 *
 * ============================================================================
 * WHY ONE MODULE
 * ============================================================================
 *
 * lib/tax-slabs.ts puts it best: "Two calculators cannot disagree if there is
 * only one ladder." Six inline copies of a model id is six places to update
 * when a provider retires one, and the evidence is that nobody updates any of
 * them, because nothing fails until a customer's key stops working.
 *
 * scripts/test-models.mjs now checks these against a curated retired-list and
 * fails when this file's stamp goes stale, the same way the statutory modules
 * are kept honest.
 *
 * ============================================================================
 * KEEPING IT CURRENT
 * ============================================================================
 *
 * The env override is the escape hatch: ANTHROPIC_MODEL, GROQ_MODEL and
 * OPENAI_MODEL still win, so an operator can move off a dying model without a
 * deploy. These are only the fallback when nothing is set.
 */

/** When a human last checked these against each provider's own docs. */
export const MODEL_DEFAULTS_CHECKED_ON = "2026-09-30";

/**
 * Anthropic. Replaces claude-3-5-sonnet-20241022, retired 2025-10-28.
 */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";

/**
 * Groq. Replaces llama-3.3-70b-versatile, decommissioned 2026-08-16;
 * this is the migration target Groq itself names.
 */
export const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";

/**
 * OpenAI. NOT changed, and the reason is worth recording: unlike the two
 * above I could not find evidence that gpt-4o-mini has been withdrawn from
 * the API. GPT-4o was retired from ChatGPT in February 2026 and there is
 * reporting about API access ending for gpt-4o, but nothing specific to
 * -mini. Swapping a working default on a guess is its own outage, so this
 * stays until somebody confirms it — and the staleness check below is what
 * forces that question to be asked again rather than forgotten.
 */
export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

/** Resolved with the operator's override taking precedence. */
export const anthropicModel = () => process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL;
export const groqModel = () => process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
export const openaiModel = () => process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
