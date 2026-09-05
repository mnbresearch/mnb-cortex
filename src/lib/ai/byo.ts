import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { envKey } from "@/lib/env";
import { generationConfig, FAST } from "@/lib/ai/generation";

/**
 * Bring your own AI key.
 *
 * WHAT WAS MISSING, AND WHY IT BLOCKS THE BUYERS WE WANT.
 *
 * Every AI call in the product read `process.env.GEMINI_API_KEY` — one platform
 * key, ours, for every customer. That is fine for an SME who wants the thing to
 * just work. It is disqualifying for the customers above them:
 *
 *   - A company with its own AI governance cannot let a vendor decide which
 *     model sees their ledger. "Whose key is it" is the first question in any
 *     serious procurement review.
 *   - Anyone with a DPA in place needs their prompts going to THEIR provider
 *     account, under their own data-processing terms and retention settings —
 *     not pooled through ours.
 *   - A firm that already has committed spend with OpenAI or Anthropic wants to
 *     use it, not pay us a margin on top of a third provider.
 *
 * Without this, every one of those conversations ends at the same place. With
 * it, Cortex becomes something an enterprise can actually adopt, and our COGS
 * for that customer drops to zero.
 *
 * HOW IT WORKS WITHOUT REWRITING THE AI LAYER.
 *
 * The AI modules are env-driven and none of them takes an orgId — threading one
 * through six entry points and every call site would be a large, risky change
 * for a feature that is really about WHICH STRING to use.
 *
 * So the key travels in request-scoped storage instead. `chargeForMode()` is
 * called at the top of all 27 AI paths and already resolves the workspace, so
 * it loads that workspace's keys into an AsyncLocalStorage; every AI call later
 * in the same request reads them through `aiKey()`. One hook, no signature
 * changes, and a request that never calls chargeForMode simply sees the
 * platform keys as before.
 *
 * All 27 AI routes declare `runtime = "nodejs"`, which is what makes
 * node:async_hooks available. An Edge route would silently get the platform key
 * rather than break — the wrong outcome, so the boundary test keeps this file
 * out of Edge code.
 */

export type Provider = "gemini" | "openai" | "anthropic" | "groq";

export const PROVIDERS: { id: Provider; name: string; env: string; where: string; note: string }[] = [
  { id: "gemini", name: "Google Gemini", env: "GEMINI_API_KEY",
    where: "https://aistudio.google.com/apikey",
    note: "Free tier available with no card. This is what Cortex uses by default." },
  { id: "openai", name: "OpenAI", env: "OPENAI_API_KEY",
    where: "https://platform.openai.com/api-keys",
    note: "Use a project key scoped to a single project so you can revoke it independently." },
  { id: "anthropic", name: "Anthropic Claude", env: "ANTHROPIC_API_KEY",
    where: "https://console.anthropic.com/settings/keys",
    note: "Workspace keys let you cap spend per workspace from Anthropic's console." },
  { id: "groq", name: "Groq", env: "GROQ_API_KEY",
    where: "https://console.groq.com/keys",
    note: "Fast and inexpensive; a good second key purely for failover." },
];

export type OrgAiKeys = {
  /** env-var name -> key. Only providers the workspace actually configured. */
  keys: Record<string, string>;
  /**
   * True only when a workspace key will ACTUALLY SERVE the next call.
   *
   * This started as "any stored value at least 20 characters long" and that was
   * a hole worth a lot of money. `aiKey()` falls back to the platform key PER
   * PROVIDER, so pasting twenty junk characters into the Anthropic box set
   * own = true — waiving all credit metering — while every actual call still
   * ran on OUR Gemini key. Free unlimited AI on our spend, and because the
   * waiver returned before the entitlement check, it also unlocked the product
   * for a workspace that had never paid.
   *
   * So `own` now requires that the FIRST provider in the chain — the one that
   * will serve the call — is one the workspace supplied, and that its key has
   * been verified by a real provider call.
   */
  own: boolean;
  /** Verified by verifyProviderKey at connect time, per provider. */
  verified: boolean;
  /**
   * WHICH workspace these keys belong to.
   *
   * AsyncLocalStorage.enterWith() mutates the CURRENT async context, and Node
   * reuses processes and sockets across requests. Testing showed the pattern is
   * safe here only because there is always an `await` before the call — the
   * first await forks the frame, so the mutation cannot travel back to the
   * socket and reach a later request. That invariant is real but undocumented
   * and unenforced, and one memoisation away from failing.
   *
   * So the store carries its owner, and assertOrg() lets a caller that knows
   * the workspace refuse a store belonging to a different one. Cheap, and it
   * turns a silent cross-tenant key leak into nothing happening.
   */
  orgId: string | null;
};

const EMPTY: OrgAiKeys = { keys: {}, own: false, verified: false, orgId: null };

const store = new AsyncLocalStorage<OrgAiKeys>();

/**
 * Put this workspace's keys in scope for the rest of the request.
 *
 * `enterWith` rather than `run`, because the caller (chargeForMode) returns a
 * value and does not wrap the continuation — there is no callback to hand it.
 * enterWith mutates the current async context and propagates forward, which is
 * exactly the shape needed here and is why it exists.
 */
export function enterOrgAiKeys(k: OrgAiKeys): void {
  try { store.enterWith(k); } catch { /* no async context (a script, a test) — platform keys */ }
}

export function currentOrgAiKeys(): OrgAiKeys {
  try { return store.getStore() ?? EMPTY; } catch { return EMPTY; }
}

/**
 * The keys in scope, but only if they belong to `orgId`.
 *
 * A caller that knows which workspace it is serving can use this instead of
 * trusting whatever happens to be in the async context. A mismatch means the
 * store leaked across requests — which should be impossible, so it is logged
 * loudly and the platform key is used rather than a stranger's.
 */
export function keysFor(orgId: string | null | undefined): OrgAiKeys {
  const k = currentOrgAiKeys();
  if (!k.orgId) return k;                       // EMPTY, or a non-request context
  if (orgId && k.orgId === orgId) return k;
  console.error(`[byo] key store belongs to org ${k.orgId} but the caller is serving ${orgId ?? "unknown"} — ignoring it`);
  return EMPTY;
}

/**
 * The key to use for a provider: the WORKSPACE'S if they brought one, else ours.
 *
 * Every `process.env.X_API_KEY` read in the AI layer goes through here. The
 * workspace key deliberately wins — if a customer has connected their own
 * account, running their prompts through ours instead would defeat the entire
 * point and quietly bill us for work they are paying their provider for.
 *
 * Falls back to `envKey`, which also rejects placeholders like "your-key-here"
 * and anything under 20 characters. The same validation is applied to the
 * workspace's key, so a half-filled form does not take down their AI.
 */
export function aiKey(envName: string): string | undefined {
  const own = currentOrgAiKeys().keys[envName];
  if (own && own.trim().length >= 20) return own.trim();
  return envKey(envName);
}

/**
 * Run `fn` with a workspace's AI keys in scope.
 *
 * chargeForMode() covers the 27 request paths, but NOT the ones that run
 * without a user: the nightly autopilot loop, scheduled reports, scheduled
 * workflows, and two server actions. Those iterate over every workspace and
 * generate with that workspace's business context — so before this, a customer
 * who bought BYO specifically so their data goes to their own provider had
 * their ledger sent to OUR Gemini account every night, while /connect told them
 * the opposite. That is a false statement about data handling, which is worse
 * than the cost.
 *
 * `run` rather than `enterWith` here, because these are loops: each iteration
 * must see its OWN workspace's keys and nothing must leak into the next one.
 * enterWith would mutate the surrounding context and carry org A's key into
 * org B's turn.
 */
export async function withOrgAiKeys<T>(orgId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  const keys = await loadOrgAiKeys(orgId);
  return store.run(keys, fn);
}

/** True when this request is running on the workspace's OWN key. */
export function usingOwnKey(): boolean {
  return currentOrgAiKeys().own;
}

/**
 * Load a workspace's AI keys from the encrypted credential store.
 *
 * Stored under the `ai` provider in `integrations`, the same AES-256-GCM path
 * as every other credential — see lib/crypto.ts. Never logged, never returned
 * to the browser, and redacted from the workspace export.
 */
export async function loadOrgAiKeys(orgId: string | null | undefined): Promise<OrgAiKeys> {
  if (!orgId) return EMPTY;
  try {
    const { credentialsFor } = await import("@/lib/credentials");
    const c = await credentialsFor(orgId, "ai");
    if (!c) return EMPTY;

    const keys: Record<string, string> = {};
    for (const p of PROVIDERS) {
      const v = String((c as any)[p.id] ?? (c as any)[p.env] ?? "").trim();
      if (v.length >= 20) keys[p.env] = v;
    }
    if (!Object.keys(keys).length) return EMPTY;

    /*
      Did the key pass a real provider call when it was connected?

      /api/integrations writes last_test_ok into `config` alongside the
      credential — but credentialsFor() deliberately strips it, along with
      `hint` and `last_test_at`, so that it returns credentials and nothing
      else. So it is read straight off the row here rather than through that
      function.

      A key that never verified must not waive billing. The failure mode
      otherwise is a workspace running free on OUR platform key while believing
      they are on their own — wrong in both directions at once.
    */
    let verified = false;
    try {
      const { serviceClient } = await import("@/lib/supabase/server");
      const svc = serviceClient();
      const { data: row } = await svc!
        .from("integrations").select("config")
        .eq("org_id", orgId).eq("provider", "ai").maybeSingle();
      verified = (row as any)?.config?.last_test_ok === true;
    } catch { verified = false; }

    /*
      `own` means the provider that will SERVE the call is theirs — not merely
      that they stored something. providerChainFor() mirrors the ordering in
      lib/ai/cortex.ts, so this answers the same question the request will.
    */
    const serving = firstServingProvider(keys);
    return { keys, verified, orgId, own: verified && serving === "workspace" };
  } catch {
    /*
      Credential store unreachable, or ENCRYPTION_KEY missing. Fall back to the
      platform key rather than failing the request: the customer's AI keeps
      working, and lib/crypto.ts already refuses to STORE secrets when
      encryption is unavailable, so there is nothing to leak here.
    */
    return EMPTY;
  }
}

/**
 * Which key will serve the next call — the workspace's, or ours?
 *
 * Mirrors providerChain() in lib/ai/cortex.ts: Gemini, then Groq, then
 * Anthropic, then OpenAI, and AI_PROVIDER forces one. If the first provider
 * with ANY key available is one WE supply, the call runs on our spend and the
 * workspace must still be metered, whatever else they have stored.
 */
function firstServingProvider(keys: Record<string, string>): "workspace" | "platform" | "none" {
  const forced = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const order = forced
    ? [PROVIDERS.find((p) => p.id === forced)].filter(Boolean) as typeof PROVIDERS
    : [
        PROVIDERS.find((p) => p.id === "gemini")!,
        PROVIDERS.find((p) => p.id === "groq")!,
        PROVIDERS.find((p) => p.id === "anthropic")!,
        PROVIDERS.find((p) => p.id === "openai")!,
      ];
  for (const p of order) {
    const mine = keys[p.env];
    if (mine && mine.trim().length >= 20) return "workspace";
    if (envKey(p.env)) return "platform";
  }
  return "none";
}

/**
 * Does a key actually work? Makes ONE real, minimal call.
 *
 * A "Test" button that only checks the string is non-empty is worse than no
 * button: it tells the customer they are connected, and they find out they are
 * not when a report comes back empty three days later. This spends a few tokens
 * to answer the question honestly.
 */
export async function verifyProviderKey(provider: Provider, key: string): Promise<{ ok: boolean; detail: string }> {
  const k = key.trim();
  if (k.length < 20) return { ok: false, detail: "That does not look like a complete API key." };

  const timeout = AbortSignal.timeout(15_000);
  try {
    if (provider === "gemini") {
      const { geminiTextModels } = await import("@/lib/ai/models");
      const model = geminiTextModels()[0];
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(k)}`,
        /*
          The SHARED profile, not a hand-rolled `maxOutputTokens: 8`.

          scripts/test-ai-profiles.mjs caught this, and it was not a style
          point. Gemini 3.x models think by default, and thinking is drawn from
          the same output allowance — so an 8-token cap with no thinkingConfig
          returns HTTP 200 with an EMPTY response. This function would then have
          reported a perfectly good key as broken, which is the single worst
          outcome for a Test button: it sends the customer off to re-issue a key
          that was already working.

          FAST is the smallest profile that reserves a real thinking budget.
        */
        { method: "POST", signal: timeout, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
                                 generationConfig: generationConfig(FAST) }) });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok) {
        /* A 200 with no text means the model produced nothing — usually thinking
           having eaten the budget. The key is fine; say so, but do not claim an
           answer we did not get. */
        const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text
          ? { ok: true, detail: `Working — answered on ${model}.` }
          : { ok: true, detail: `The key is accepted, but ${model} returned an empty response. It should still work; if answers come back blank, tell us.` };
      }
      return { ok: false, detail: explain(r.status, j?.error?.message) };
    }

    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        signal: timeout, headers: { Authorization: `Bearer ${k}` } });
      if (r.ok) return { ok: true, detail: "Working — the key is valid and has model access." };
      const j = await r.json().catch(() => ({} as any));
      return { ok: false, detail: explain(r.status, j?.error?.message) };
    }

    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models", {
        signal: timeout, headers: { "x-api-key": k, "anthropic-version": "2023-06-01" } });
      if (r.ok) return { ok: true, detail: "Working — the key is valid and has model access." };
      const j = await r.json().catch(() => ({} as any));
      return { ok: false, detail: explain(r.status, j?.error?.message) };
    }

    // groq
    const r = await fetch("https://api.groq.com/openai/v1/models", {
      signal: timeout, headers: { Authorization: `Bearer ${k}` } });
    if (r.ok) return { ok: true, detail: "Working — the key is valid." };
    const j = await r.json().catch(() => ({} as any));
    return { ok: false, detail: explain(r.status, j?.error?.message) };
  } catch (e: any) {
    if (e?.name === "TimeoutError") return { ok: false, detail: "The provider did not respond within 15 seconds." };
    return { ok: false, detail: `Could not reach the provider: ${String(e?.message || e).slice(0, 120)}` };
  }
}

/** Turn a status code into something the person reading it can act on. */
function explain(status: number, msg?: string): string {
  const tail = msg ? ` — ${String(msg).slice(0, 140)}` : "";
  /*
     NO provider text on an auth failure. OpenAI's 401 body is
     "Incorrect API key provided: sk-pr****XYZ" — a partially-redacted echo of
     the key itself. Since `op:"test"` verifies the STORED key, echoing it would
     hand one admin fragments of another admin's credential.
  */
  if (status === 401 || status === 403) return `The key was rejected (HTTP ${status}). Check you copied all of it, and that it has not been revoked.`;
  if (status === 429) return `The key is valid but currently rate-limited or out of quota (HTTP 429). Check your billing with the provider.${tail}`;
  if (status === 404) return `The key works but the model was not found (HTTP 404) — your account may not have access to it yet.${tail}`;
  if (status >= 500) return `The provider is having problems right now (HTTP ${status}). Try again shortly.${tail}`;
  return `The provider returned HTTP ${status}.${tail}`;
}
