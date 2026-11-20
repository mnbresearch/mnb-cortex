import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { oauthUrl } from "@/lib/knowledge/core";

/*
  OAuth for Microsoft 365 and Google Workspace — read-only scopes only
  (lib/knowledge/core.ts MICROSOFT_SCOPES / GOOGLE_SCOPES).

  The `state` parameter is an HMAC-signed, 15-minute token naming the
  workspace, the user and the provider. The callback refuses a state that is
  unsigned, expired, for another provider, or for a different signed-in user —
  so a consent screen cannot be replayed into someone else's workspace.

  Setup (one time, by MNB, per deployment):
    Microsoft — Entra ID → App registrations → New: redirect URI
      <APP_URL>/api/knowledge/callback/microsoft365, delegated permissions
      User.Read, Mail.Read, Chat.Read, Files.Read.All, offline_access.
      Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET (and MICROSOFT_TENANT
      to lock it to one tenant; default "common").
    Google — Cloud console → OAuth client (Web): redirect URI
      <APP_URL>/api/knowledge/callback/google_workspace, scopes gmail.readonly
      and drive.readonly. Set GOOGLE_CLIENT_ID (or reuse
      NEXT_PUBLIC_GOOGLE_CLIENT_ID) and GOOGLE_CLIENT_SECRET.
*/

export type OAuthProvider = "microsoft365" | "google_workspace";

const env = (k: string) => {
  const v = process.env[k];
  return v && v !== "[SENSITIVE]" ? v : "";
};

export function clientFor(p: OAuthProvider): { id: string; secret: string; tenant: string } | null {
  if (p === "microsoft365") {
    const id = env("MICROSOFT_CLIENT_ID"), secret = env("MICROSOFT_CLIENT_SECRET");
    return id && secret ? { id, secret, tenant: env("MICROSOFT_TENANT") || "common" } : null;
  }
  const id = env("GOOGLE_CLIENT_ID") || env("NEXT_PUBLIC_GOOGLE_CLIENT_ID"), secret = env("GOOGLE_CLIENT_SECRET");
  return id && secret ? { id, secret, tenant: "" } : null;
}

export function configured(p: OAuthProvider): boolean { return clientFor(p) !== null; }

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

export function consentUrl(req: Request, p: OAuthProvider, state: string): string | null {
  const c = clientFor(p); if (!c) return null;
  return oauthUrl(p, { clientId: c.id, redirectUri: redirectUri(appBase(req), p), state, tenant: c.tenant });
}

type TokenSet = { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string };

async function tokenRequest(p: OAuthProvider, form: Record<string, string>): Promise<TokenSet | { error: string }> {
  const c = clientFor(p); if (!c) return { error: "This connector is not configured on this deployment." };
  const url = p === "microsoft365" ? `https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token` : "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({ client_id: c.id, client_secret: c.secret, ...form });
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return { error: String(j.error_description || j.error || `HTTP ${r.status}`).slice(0, 300) };
    return j as TokenSet;
  } catch (e: any) { return { error: e?.message || "The sign-in service did not answer." }; }
}

export function exchangeCode(req: Request, p: OAuthProvider, code: string) {
  return tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(appBase(req), p) });
}

export function refreshAccess(p: OAuthProvider, refreshToken: string) {
  return tokenRequest(p, { grant_type: "refresh_token", refresh_token: refreshToken, ...(p === "microsoft365" ? { scope: "offline_access User.Read Mail.Read Chat.Read Files.Read.All" } : {}) });
}
