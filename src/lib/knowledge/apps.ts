import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

/*
  A company's own Microsoft / Google app for Company Knowledge (optional).
  See supabase/migrations/2026_zzzz_t_knowledge_oauth_apps.sql for why a
  company would bring one. Read and written only here, server-side; the secret
  is encrypted at rest and never returned — the settings screen sees only
  whether one is saved and the client id.
*/

export type AppProvider = "microsoft365" | "google_workspace";
export type OrgApp = { clientId: string; clientSecret: string; tenant: string | null };

const db = () => serviceClient() as any;

export async function appsReady(): Promise<boolean> {
  const sb = db(); if (!sb) return false;
  try { const { error } = await sb.from("knowledge_oauth_apps").select("id").limit(1); return !error; } catch { return false; }
}

export async function orgApp(orgId: string, provider: AppProvider): Promise<OrgApp | null> {
  const sb = db(); if (!sb) return null;
  const { data, error } = await sb.from("knowledge_oauth_apps").select("client_id, client_secret, tenant").eq("org_id", orgId).eq("provider", provider).maybeSingle();
  if (error || !data) return null;
  const secret = decryptSecret((data as any).client_secret);
  return secret ? { clientId: String((data as any).client_id), clientSecret: secret, tenant: (data as any).tenant || null } : null;
}

/** What the settings screen may see: never the secret. */
export async function orgAppSummary(orgId: string, provider: AppProvider): Promise<{ saved: boolean; clientId: string | null; tenant: string | null; updatedAt: string | null }> {
  const sb = db(); if (!sb) return { saved: false, clientId: null, tenant: null, updatedAt: null };
  const { data } = await sb.from("knowledge_oauth_apps").select("client_id, tenant, updated_at").eq("org_id", orgId).eq("provider", provider).maybeSingle();
  return data ? { saved: true, clientId: (data as any).client_id, tenant: (data as any).tenant, updatedAt: (data as any).updated_at } : { saved: false, clientId: null, tenant: null, updatedAt: null };
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** Shape checks before anything is stored, so a pasted secret in the id box is caught here, not at sign-in. */
export function validateApp(provider: AppProvider, a: { clientId: string; clientSecret: string; tenant?: string | null }): string | null {
  const id = String(a.clientId || "").trim(), secret = String(a.clientSecret || "").trim(), tenant = String(a.tenant || "").trim();
  if (!id || !secret) return "Give both the client (application) id and the client secret.";
  if (secret.length < 8 || secret.length > 400) return "That client secret does not look right.";
  if (provider === "microsoft365") {
    if (!GUID.test(id)) return "The Microsoft Application (client) ID is a GUID like 1a2b3c4d-…; copy it from the app's Overview page.";
    if (!tenant) return "Give your Directory (tenant) ID, or your domain such as yourcompany.onmicrosoft.com.";
    if (!GUID.test(tenant) && !DOMAIN.test(tenant)) return "The tenant must be your Directory (tenant) ID or your Microsoft domain.";
  } else if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(id)) {
    return "The Google client ID ends in .apps.googleusercontent.com; copy it from Credentials → OAuth 2.0 Client IDs.";
  }
  return null;
}

export async function saveOrgApp(orgId: string, userId: string, provider: AppProvider, a: { clientId: string; clientSecret: string; tenant?: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = validateApp(provider, a); if (bad) return { ok: false, error: bad };
  const enc = encryptSecret(String(a.clientSecret).trim());
  if (!enc) return { ok: false, error: "Secrets cannot be stored: ENCRYPTION_KEY is not configured on this deployment." };
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  const { error } = await sb.from("knowledge_oauth_apps").upsert({
    org_id: orgId, provider, client_id: String(a.clientId).trim(), client_secret: enc,
    tenant: provider === "microsoft365" ? String(a.tenant || "").trim() : null, created_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,provider" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteOrgApp(orgId: string, provider: AppProvider): Promise<boolean> {
  const sb = db(); if (!sb) return false;
  const { error } = await sb.from("knowledge_oauth_apps").delete().eq("org_id", orgId).eq("provider", provider);
  return !error;
}
