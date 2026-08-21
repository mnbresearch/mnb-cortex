import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";

/**
 * Read a workspace's own credentials for a provider.
 *
 * This is the bring-your-own-key path. A customer pastes their keys on
 * /integrations, they're encrypted with AES-256-GCM into
 * `integrations.credentials_encrypted`, and the feature that needs them reads
 * them back here — so each workspace talks to its OWN Meta / Shopify / Stripe
 * account, not a shared platform one.
 *
 * Two mistakes this exists to prevent, both of which were live:
 *
 *  - Reading `integrations.config` instead. /api/integrations deliberately
 *    keeps only NON-password fields there for display, so the secret is never
 *    in it. The sync layer did this and could never authenticate.
 *  - Storing credentials the product then never reads. WhatsApp collected a
 *    token and phone number id on /integrations and then sent using
 *    environment variables — one platform-wide account — so a customer who
 *    connected their own Meta account saw nothing happen.
 *
 * Falls back to environment variables so a single-tenant or self-hosted
 * deployment can still configure a provider globally.
 */
export type Creds = Record<string, string>;

export async function credentialsFor(orgId: string, provider: string): Promise<Creds | null> {
  if (!orgId || !provider) return null;
  const svc = serviceClient();
  if (!svc) return null;

  const { data } = await svc
    .from("integrations")
    .select("config, credentials_encrypted, status")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;

  const out: Creds = {};

  // Non-secret fields first (shop domain, phone number id, and so on).
  const cfg = (data as any).config;
  if (cfg && typeof cfg === "object") {
    for (const [k, v] of Object.entries(cfg)) {
      if (k === "hint" || k === "last_test_ok" || k === "last_test_at") continue;
      out[k] = String(v ?? "");
    }
  }

  // Then the real secrets, which win.
  const enc = String((data as any).credentials_encrypted || "");
  if (enc) {
    const plain = decryptSecret(enc);
    // decryptSecret returns null (it does not throw) when ENCRYPTION_KEY is
    // absent or has been rotated since the credential was saved. Saying so is
    // far more useful than a downstream "missing token" that sends the customer
    // hunting for the wrong problem.
    if (!plain) {
      throw new Error(
        "Saved credentials could not be decrypted — ENCRYPTION_KEY is missing or has changed. Re-connect this integration to store them again.",
      );
    }
    try {
      const parsed = JSON.parse(plain);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) out[k] = String(v ?? "");
      }
    } catch {
      throw new Error("Saved credentials are corrupt. Re-connect this integration.");
    }
  }

  return Object.keys(out).length ? out : null;
}
