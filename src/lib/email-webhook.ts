import crypto from "crypto";

/**
 * Verifying a Resend (Svix) delivery webhook, and deciding what each event
 * means.
 *
 * WHY THIS IS A LIB AND NOT PART OF THE ROUTE.
 *
 * It started life inside src/app/api/email/events/route.ts, exported so a test
 * could execute it. Next.js rejects that: a route file may export only HTTP
 * method handlers and a short list of config fields, so
 *
 *     Type error: "verifySvix" is not a valid Route export field
 *
 * and the production build failed — while `tsc --noEmit` passed, because the
 * rule is Next's, not TypeScript's. The test then could not import the route
 * (it pulls in next/server) and fell back to asserting things about the source
 * TEXT, which is the weaker check I had already decided against elsewhere.
 *
 * Moving it here fixes both at once: the route exports only POST, and the
 * signature check is a plain function a test can run with real HMACs.
 *
 * THE SCHEME. Svix signs `${svix-id}.${svix-timestamp}.${rawBody}` with
 * HMAC-SHA256, keyed on the base64 body of the secret (everything after
 * `whsec_`), and sends it as one or more space-separated `v1,<base64>` values.
 * Several are possible because Svix rotates keys, so any v1 match is a pass.
 */

/** Replay window, per Svix's own recommendation. */
export const TOLERANCE_SECONDS = 300;

export function verifySvix(args: {
  secret: string; id: string; timestamp: string; signature: string; body: string;
  now?: number;
}): { ok: boolean; reason?: string } {
  const { secret, id, timestamp, signature, body } = args;
  if (!secret) return { ok: false, reason: "no signing secret configured" };
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing svix headers" };

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "timestamp is not a number" };
  const now = Math.floor((args.now ?? Date.now()) / 1000);
  if (Math.abs(now - tsNum) > TOLERANCE_SECONDS) {
    /* Without this, a captured delivery event can be replayed for ever — and
       "delivered" is exactly the state somebody would want to forge over a
       bounce. */
    return { ok: false, reason: `timestamp outside the ${TOLERANCE_SECONDS}s window` };
  }

  const keyB64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let keyBytes: Buffer;
  try { keyBytes = Buffer.from(keyB64, "base64"); } catch { return { ok: false, reason: "secret is not base64" }; }
  if (!keyBytes.length) return { ok: false, reason: "empty secret" };

  const expected = crypto.createHmac("sha256", keyBytes)
    .update(`${id}.${timestamp}.${body}`).digest("base64");

  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    /* Length first: timingSafeEqual throws on a mismatch, and the length of a
       signature is not the part worth protecting. */
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true };
  }
  return { ok: false, reason: "no matching v1 signature" };
}

/**
 * Which Resend events change a message's state, and to what.
 *
 * email.sent, email.delivery_delayed and email.opened deliberately change
 * nothing: `sent` is the acceptance we already recorded ourselves,
 * `delivery_delayed` is not an outcome, and an open is tracking — treating it
 * as delivery evidence would let a spam filter's preview count as a read
 * receipt.
 */
export function mapEventToStatus(type: string): "delivered" | "bounced" | "complained" | null {
  const t = String(type || "").toLowerCase();
  if (t === "email.delivered") return "delivered";
  if (t === "email.bounced") return "bounced";
  if (t === "email.complained") return "complained";
  return null;
}
