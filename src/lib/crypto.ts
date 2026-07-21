import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Envelope encryption for third-party credentials (AES-256-GCM).
 *
 * Design rules:
 *  - Secrets are encrypted BEFORE they touch the database.
 *  - If no ENCRYPTION_KEY is configured we refuse to store secrets at all,
 *    rather than silently persisting them in plaintext.
 *  - Plaintext is only ever produced server-side, at the moment of an API call.
 */

const SALT = "mnb-cortex-integrations-v1";

function key(): Buffer | null {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) return null;
  return scryptSync(secret, SALT, 32);
}

export function encryptionAvailable(): boolean {
  return key() !== null;
}

/** Returns "v1.<iv>.<tag>.<ciphertext>" (all base64url) or null if unavailable. */
export function encryptSecret(plain: string): string | null {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string | null {
  const k = key();
  if (!k || !payload?.startsWith("v1.")) return null;
  try {
    const [, ivB, tagB, dataB] = payload.split(".");
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(ivB, "base64url"));
    d.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([d.update(Buffer.from(dataB, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}

/** Safe display form — never expose a full credential to the browser. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 3)}••••••${plain.slice(-4)}`;
}
