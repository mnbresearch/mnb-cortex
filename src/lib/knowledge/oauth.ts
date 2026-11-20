import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { oauthUrl } from "@/lib/knowledge/core";
import { orgApp } from "@/lib/knowledge/apps";

/*
  OAuth for Microsoft 365 and Google Workspace — read-only scopes only
  (lib/knowledge/core.ts MICROSOFT_SCOPES / GOOGLE_SCOPES).

  WHICH APP SIGNS A COMPANY IN
    1. The company's OWN app, if an admin saved one under Settings → Company
       Knowledge (lib/knowledge/apps.ts). Registered in their own Entra ID
       tenant or Google Cloud organisation.
    2. Otherwise Cortex's SHARED multi-tenant app, from the deployment's
       environment (MICROSOFT_CLIENT_ID / _SECRET, GOOGLE_CLIENT_ID / _SECRET).
  One shared app serves every company: a company does not need its own app
  unless its IT policy requires one, or (Google) until the shared app has
  passed Google's restricted-scope verification.

  The `state` parameter is an HMAC-signed, 15-minute token naming the
  workspace, the user and the provider. The callback refuses a state that is
  unsigned, expired, for another provider, or for a different signed-in user.
*/

export type OAuthProvider = "microsoft365" | "google_workspace";
export type OAuthClient = { id: string; secret: string; tenant: string; own: boolean };

const env = (k: string) => {
  const v = process.env[k];
  return v && v !== "[SENSITIVE]" ? v : "";
};

/** Cortex's shared app, from the environment. */
export function sharedClient(p: OAuthProvider): OAuthClient | null {
  if (p === "microsoft365") {
    const id = env("MICROSOFT_CLIENT_ID"), secret = env("MICROSOFT_CLIENT_SECRET");
    return id && secret ? { id, secret, tenant: env("MICROSOFT_TENANT") || "common", own: false } : null;
  }
  const id = env("GOOGLE_CLIENT_ID") || env("NEXT_PUBLIC_GOOGLE_CLIENT_ID"), secret = env("GOOGLE_CLIENT_SECRET");
  return id && secret ? { id, secret, tenant: "", own: false } : null;
}

/** The app that signs this workspace in: its own if saved, else the shared one. */
export async function clientFor(p: OAuthProvider, orgId?: string | null): Promise<OAuthClient | null> {
  if (orgId) {
    const own = await orgApp(orgId, p).catch(() => null);
    if (own) return { id: own.clientId, secret: own.clientSecret, tenant: own.tenant || (p === "microsoft365" ? "organizations" : ""), own: true };
  }
  return sharedClient(p);
}

export function configured(p: OAuthProvider): boolean { return sharedClient(p) !== null; }
export async function configuredFor(p: OAuthProvider, orgId: string): Promise<boolean> { return (await clientFor(p, orgId)) !== null; }

export function appBase(req: Request): string {
  return (env("NEXT_PUBLIC_APP_URL") || new URL(req.url).origin).replace(/\/$/, "");
}

export const redirectUri = (base: string, p: OAuthProvider) => `${base}/api/knowledge/callback/${p}`;

function signingKey(): string {
  return env("ENCRYPTION_KEY") || env("CRON_SECRET") || "";
}

export function signState(payload: { orgId: string; userId: string; provider: OAuthProvider }): string | null {
  const key = signingKey(); if (!key) return null;
  const body = Buffer.from(JSON.stringify({ ...payload, n: randomBytes(8).toString("hex"), exp: Date.now() + 15 * 60_000 })).toString("base64url");
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, provider: OAuthProvider, userId: string): { orgId: string } | null {
  const key = signingKey(); if (!key || !state || !state.includes(".")) return null;
  const [body, sig] = state.split(".");
  const want = createHmac("sha256", key).update(body).digest("base64url");
  const a = Buffer.from(sig || ""), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (p.provider !== provider || p.userId !== userId || !(Number(p.exp) > Date.now())) return null;
    return { orgId: String(p.orgId) };
  } catch { return null; }
}

export async function consentUrl(req: Request, p: OAuthProvider, state: string, orgId: string): Promise<string | null> {
  const c = await clientFor(p, orgId); if (!c) return null;
  return oauthUrl(p, { clientId: c.id, redirectUri: redirectUri(appBase(req), p), state, tenant: c.tenant });
}

/**
 * Microsoft's organisation-wide consent: a Global or Cloud Application
 * Administrator of the company's tenant approves Cortex's read-only
 * permissions once, for everyone in the company. Then each person (or the
 * admin) signs in without a consent prompt. Returns to the same callback with
 * admin_consent=True.
 */
export async function adminConsentUrl(req: Request, state: string, orgId: string): Promise<string | null> {
  const c = await clientFor("microsoft365", orgId); if (!c) return null;
  const tenant = c.tenant && c.tenant !== "common" ? c.tenant : "organizations";
  const u = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/adminconsent`);
  u.searchParams.set("client_id", c.id);
  u.searchParams.set("scope", "https://graph.microsoft.com/.default");
  u.searchParams.set("redirect_uri", redirectUri(appBase(req), "microsoft365"));
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenSet = { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string };

async function tokenRequest(p: OAuthProvider, orgId: string | null, form: Record<string, string>): Promise<TokenSet | { error: string }> {
  const c = await clientFor(p, orgId); if (!c) return { error: "This connector is not configured for this workspace." };
  const url = p === "microsoft365" ? `https://login.microsoftonline.com/${encodeURIComponent(c.tenant || "common")}/oauth2/v2.0/token` : "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({ client_id: c.id, client_secret: c.secret, ...form });
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return { error: String(j.error_description || j.error || `HTTP ${r.status}`).slice(0, 300) };
    return j as TokenSet;
  } catch (e: any) { return { error: e?.message || "The sign-in service did not answer." }; }
}

export function exchangeCode(req: Request, p: OAuthProvider, code: string, orgId: string) {
  return tokenRequest(p, orgId, { grant_type: "authorization_code", code, redirect_uri: redirectUri(appBase(req), p) });
}

export function refreshAccess(p: OAuthProvider, refreshToken: string, orgId: string) {
  return tokenRequest(p, orgId, { grant_type: "refresh_token", refresh_token: refreshToken, ...(p === "microsoft365" ? { scope: "offline_access User.Read Mail.Read Chat.Read Files.Read.All" } : {}) });
}
