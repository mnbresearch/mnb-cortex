import crypto from "crypto";

/**
 * Cashfree webhook signature verification.
 *
 * Extracted from the route so it can be tested without standing up a server.
 * The previous version was inline, returned a bare boolean, and logged nothing —
 * so a webhook rejected in production said only "invalid signature", with no way
 * to tell whether the secret was wrong, the header was missing, the body had
 * been re-serialised, or the clock was out. Every one of those has a different
 * fix, and money is not being fulfilled while you guess.
 *
 * Cashfree signs: base64( HMAC-SHA256( timestampHeader + rawBody, clientSecret ) )
 *
 * THREE THINGS THAT MUST NOT DRIFT:
 *
 *  1. The signature is computed over the RAW timestamp header string exactly as
 *     received, and the RAW body bytes exactly as received. Never a normalised
 *     timestamp, and never JSON.parse → JSON.stringify: round-tripping changes
 *     whitespace and key order, and the HMAC will never match again.
 *  2. The secret is TRIMMED. Everything else in this codebase reads Cashfree
 *     credentials through envKey(), which trims; this path read
 *     process.env.CASHFREE_SECRET_KEY raw. A trailing newline pasted into the
 *     Vercel dashboard is invisible, is tolerated by the HTTP header on the
 *     order-creation call, and silently breaks every HMAC — which presents
 *     exactly as "payments work but webhooks 401".
 *  3. Comparison is constant-time.
 */

export type VerifyInput = {
  rawBody: string;
  signature: string;
  timestamp: string;
  secret: string | undefined;
  /**
   * Replay window. Generous on purpose: Cashfree reuses the ORIGINAL timestamp
   * on retries and its retry schedule spans several minutes, so a tight window
   * silently drops the later attempts — which look identical to a webhook that
   * was never sent. Replay is separately neutralised by the idempotency claim in
   * settleOrder/handleSubscriptionEvent, so this is a second line of defence and
   * must not cost real deliveries.
   */
  maxAgeSeconds?: number;
  /** Injectable for tests. */
  now?: number;
};

export type VerifyResult =
  | { ok: true; ageSeconds: number }
  | { ok: false; reason: string; detail?: Record<string, unknown> };

export const DEFAULT_MAX_AGE_SECONDS = 30 * 60;

/**
 * Cashfree sends `x-webhook-timestamp` in epoch MILLISECONDS — a 13-digit value
 * such as 1787814895250. Comparing that against a seconds clock gives a
 * difference of roughly 1.79 trillion, so a naive age check rejects EVERY real
 * webhook before the signature is ever examined, while hand-built test requests
 * (usually made with `date +%s`, i.e. seconds) sail through. That is why the bug
 * hides: the endpoint passes every manual test and fails every real delivery.
 *
 * Normalising by magnitude handles both without guessing: anything past 1e11
 * cannot be seconds, because seconds-since-epoch will not reach 1e11 until the
 * year ~5138.
 */
export function toEpochSeconds(raw: string | number): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.abs(n) > 1e11 ? n / 1000 : n;
}

export function verifyCashfreeWebhook(input: VerifyInput): VerifyResult {
  const { rawBody, signature, timestamp } = input;
  const maxAge = input.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const now = input.now ?? Date.now();

  // FAIL CLOSED. An unset secret must never mean "accept everything".
  const secret = (input.secret || "").trim();
  if (!secret) return { ok: false, reason: "secret_not_configured" };

  if (!signature) return { ok: false, reason: "missing_signature_header" };
  if (!timestamp) {
    // Worth its own reason: the HMAC covers timestamp + body, so an absent
    // header does not fail loudly — it quietly hashes the body alone and
    // produces a mismatch that looks like a wrong secret.
    return { ok: false, reason: "missing_timestamp_header" };
  }

  const tsSeconds = toEpochSeconds(timestamp);
  if (tsSeconds === null) return { ok: false, reason: "malformed_timestamp", detail: { timestamp } };

  const ageSeconds = Math.abs(now / 1000 - tsSeconds);
  if (ageSeconds > maxAge) {
    return {
      ok: false,
      reason: "timestamp_outside_window",
      detail: { ageSeconds: Math.round(ageSeconds), maxAge, interpretedAs: String(timestamp).length >= 13 ? "milliseconds" : "seconds" },
    };
  }

  // RAW header string, RAW body. Not the normalised seconds value.
  const expected = crypto.createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return {
      ok: false,
      reason: "signature_mismatch",
      detail: { receivedLength: a.length, expectedLength: b.length, bodyBytes: rawBody.length, note: "length differs — usually a different signing scheme or an empty secret" },
    };
  }
  if (!crypto.timingSafeEqual(a, b)) {
    return {
      ok: false,
      reason: "signature_mismatch",
      detail: {
        bodyBytes: rawBody.length,
        timestampDigits: String(timestamp).length,
        // Enough to compare against the Cashfree dashboard's Headers tab by eye,
        // far too little to help anyone forge one. The signature is not itself a
        // secret; the key that produces it is, and that never leaves here.
        receivedPrefix: signature.slice(0, 6),
        expectedPrefix: expected.slice(0, 6),
        note: "same length, different value — usually the wrong secret, a re-serialised body, or the wrong environment's key",
      },
    };
  }

  return { ok: true, ageSeconds: Math.round(ageSeconds) };
}
