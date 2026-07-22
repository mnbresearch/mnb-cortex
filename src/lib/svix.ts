import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies a Svix-style webhook signature (Resend uses Svix).
 *   signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
 *   HMAC-SHA256 with the base64 secret (after stripping "whsec_"), base64-encoded.
 *   The `svix-signature` header is a space-separated list of `v1,<sig>` entries.
 * Rejects timestamps older than 5 minutes (replay protection).
 */
export function verifySvix(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > 60 * 5) return false;

  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try { keyBytes = Buffer.from(key, "base64"); } catch { return false; }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", keyBytes).update(signedContent).digest("base64");
  const expBuf = Buffer.from(expected);

  // Header may contain multiple space-separated signatures like "v1,<sig> v1,<sig2>".
  for (const part of signature.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) return true;
  }
  return false;
}
