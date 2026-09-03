import "server-only";
/*
  The real health checks, and the cache in front of them.

  MOVED OUT OF app/api/health/route.ts.

  The cache has to be shared with /api/badge, and a Next.js route file may only
  export the HTTP verbs plus a fixed set of config keys — exporting a helper
  from one fails the build with "Type '() => Promise<any>' is not assignable to
  type 'never'". Which is the framework telling you the shared thing belongs in
  a module, so here it is.
*/
import { anyEnvKey, envKey } from "@/lib/env";
import { hasSupabase, serviceClient } from "@/lib/supabase/server";
import { encryptionAvailable } from "@/lib/crypto";
import { geminiTextModels, geminiImageModels, geminiUrl } from "@/lib/ai/models";
import { veoModels } from "@/lib/ai/video";


/**
 * Real health checks.
 *
 * This endpoint used to report "operational" from `Boolean(process.env.X)`. The
 * AI provider could be down, the key revoked, Resend failing and the daily cron
 * broken for weeks — and it still said all systems operational, with `ok: true`
 * hardcoded. Any external monitor pointed at it could never fire.
 *
 * Every check below actually talks to the dependency. `ok` is false when
 * anything critical is down, and the HTTP status follows, so uptime monitoring
 * works the way people expect.
 */

type Check = { name: string; status: "operational" | "degraded" | "down"; detail?: string; critical?: boolean };

const TIMEOUT = 6000;

/*
  A language model is not a database and must not be timed like one.

  This check reported the AI engine "down — no response in 6000ms" on eight
  consecutive polls while the product was working perfectly: a real
  /api/ai call returned a correct, data-grounded answer in the same window.
  Because the AI engine is `critical: true`, that false negative dragged the
  WHOLE status page to "down" over a service that was merely slow.

  The comment further down this file already warns about precisely this — that
  a false alarm "erodes trust in the check as surely as a missed one" — and the
  check was committing it. A model round trip against a real workspace measured
  27.9s and 38.9s; expecting even a one-token ping inside 6s was never realistic.

  So model checks get their own, generous budget, and slowness is reported as
  DEGRADED with the measured latency rather than as an outage. "Down" is now
  reserved for a model that actually refuses: a bad key, a missing model, a
  network failure, or no answer at all within a budget no working model exceeds.
*/
const MODEL_TIMEOUT = 20000;
/** Above this a model is answering, but slowly enough that users will feel it. */
const MODEL_SLOW = 6000;

/** fetch with a hard timeout — a hung dependency must not hang the health check. */
async function ping(
  url: string,
  init?: RequestInit,
  timeout: number = TIMEOUT,
): Promise<{ ok: boolean; status: number; error?: string; ms: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const started = Date.now();
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return { ok: r.ok, status: r.status, ms: Date.now() - started };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: e?.name === "AbortError" ? `no response in ${timeout}ms` : (e?.message || "network error"),
    };
  } finally {
    clearTimeout(t);
  }
}

/** Can we actually read from the database? */
async function checkDatabase(): Promise<Check> {
  if (!hasSupabase()) return { name: "Database", status: "down", detail: "Supabase not configured", critical: true };
  const sb = serviceClient();
  if (!sb) return { name: "Database", status: "degraded", detail: "No service role — server-side features are off", critical: true };
  try {
    const t0 = Date.now();
    const { error } = await sb.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
    if (error) return { name: "Database", status: "down", detail: error.message, critical: true };
    return { name: "Database", status: "operational", detail: `${Date.now() - t0}ms`, critical: true };
  } catch (e: any) {
    return { name: "Database", status: "down", detail: e?.message || "query failed", critical: true };
  }
}

/** Does the AI provider actually answer? Cheap call, real answer. */
async function checkAI(): Promise<Check> {
  if (!anyEnvKey("GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY")) {
    return { name: "AI engine", status: "down", detail: "No provider key configured", critical: true };
  }
  const gem = envKey("GEMINI_API_KEY");
  if (gem) {
    // Walk the SAME candidate list cortex.ts walks. Testing only the first name
    // reported the whole engine "down" while the app was quietly succeeding on
    // the second — a false alarm, which erodes trust in the check as surely as
    // a missed one. It also names the model actually serving traffic, so a
    // silent fallback (and the extra cost it implies) is visible rather than
    // invisible.
    const candidates = geminiTextModels();
    const tried: string[] = [];
    for (const model of candidates) {
      const r = await ping(geminiUrl(model, gem), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } }),
      }, MODEL_TIMEOUT);
      if (r.ok) {
        const fellBack = model !== candidates[0];
        const slow = r.ms > MODEL_SLOW;
        // A model that answers is not down. Report the latency so a genuine
        // slowdown is visible without being mistaken for an outage.
        return {
          name: "AI engine",
          status: fellBack || slow ? "degraded" : "operational",
          detail: fellBack
            ? `gemini · ${model} — preferred ${candidates[0]} is unavailable (${tried.join(", ")}), so every call pays an extra failed request. Pin GEMINI_MODEL.`
            : slow
              ? `gemini · ${model} — answering, but slowly (${(r.ms / 1000).toFixed(1)}s to first token). Users will feel this on every AI action.`
              : `gemini · ${model}`,
          critical: true,
        };
      }
      tried.push(`${model}: ${r.status === 404 ? "404 not found" : r.error || `HTTP ${r.status}`}`);
      // Only a 404 means "wrong name, try the next". Anything else is a real
      // fault and trying more models just burns quota against the same problem.
      if (r.status !== 404) break;
    }
    return { name: "AI engine", status: "down", detail: `no usable model — ${tried.join("; ")}`, critical: true };
  }
  const groq = envKey("GROQ_API_KEY");
  if (groq) {
    const r = await ping("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${groq}` } });
    return { name: "AI engine", status: r.ok ? "operational" : "down", detail: r.ok ? "groq" : (r.error || `HTTP ${r.status}`), critical: true };
  }
  return { name: "AI engine", status: "operational", detail: "provider configured", critical: true };
}

/** Is the Resend key valid right now? */
async function checkEmail(): Promise<Check> {
  const key = envKey("RESEND_API_KEY");
  if (!key) return { name: "Email", status: "down", detail: "RESEND_API_KEY not configured" };
  const r = await ping("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
  if (r.ok) return { name: "Email", status: "operational" };
  return { name: "Email", status: r.status === 401 || r.status === 403 ? "down" : "degraded", detail: r.error || `HTTP ${r.status}` };
}

/** Are the payment credentials live? */
async function checkPayments(): Promise<Check> {
  const id = envKey("CASHFREE_APP_ID"), secret = envKey("CASHFREE_SECRET_KEY");
  if (!id || !secret) return { name: "Payments", status: "down", detail: "Cashfree not configured", critical: true };
  const base = (process.env.CASHFREE_ENV || "").toLowerCase() === "sandbox"
    ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
  // Fetching a non-existent order proves auth without creating anything:
  // 404 means the credentials were accepted, 401 means they weren't.
  const r = await ping(`${base}/orders/healthcheck_probe_${Date.now()}`, {
    headers: { "x-client-id": id, "x-client-secret": secret, "x-api-version": "2023-08-01" },
  });
  if (r.status === 401 || r.status === 403) return { name: "Payments", status: "down", detail: "Cashfree rejected the credentials", critical: true };
  if (r.status === 0) return { name: "Payments", status: "degraded", detail: r.error, critical: true };
  return { name: "Payments", status: "operational", detail: base.includes("sandbox") ? "sandbox" : "production", critical: true };
}

/**
 * Are the image and video models still alive?
 *
 * Google retires models on a schedule — gemini-2.0-flash went in June 2026 and
 * took this product's entire AI layer down for days before anyone noticed, and
 * Imagen 4 was shut down on 17 August 2026. Text is covered above, but image
 * and video had no check at all: the first sign of a retirement would have been
 * a customer paying 20 or 400 credits and receiving an error.
 *
 * Uses the model METADATA endpoint, not a generation call — it costs nothing
 * and returns 404 for a retired name, which is exactly the question being
 * asked. Non-critical: losing image or video is bad, but the product still runs.
 */
async function checkGenModels(): Promise<Check> {
  const key = envKey("GEMINI_API_KEY");
  if (!key) return { name: "Image & video models", status: "degraded", detail: "No Gemini key" };

  const probe = async (model: string) => {
    const r = await ping(`https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${encodeURIComponent(key)}`);
    return r.ok;
  };

  const [imgList, vidList] = [geminiImageModels(), veoModels()];
  const [imgOk, vidOk] = await Promise.all([
    (async () => { for (const m of imgList) if (await probe(m)) return m; return null; })(),
    (async () => { for (const m of vidList) if (await probe(m)) return m; return null; })(),
  ]);

  const dead: string[] = [];
  if (!imgOk) dead.push(`image (tried ${imgList.join(", ")})`);
  if (!vidOk) dead.push(`video (tried ${vidList.join(", ")})`);
  if (dead.length) {
    return { name: "Image & video models", status: "down", detail: `retired or unavailable: ${dead.join("; ")}` };
  }

  const imgFellBack = imgOk !== imgList[0];
  const vidFellBack = vidOk !== vidList[0];
  return {
    name: "Image & video models",
    status: imgFellBack || vidFellBack ? "degraded" : "operational",
    detail: `image ${imgOk}${imgFellBack ? " (fallback)" : ""} · video ${vidOk}${vidFellBack ? " (fallback — check cost, Lite is cheaper than Fast)" : ""}`,
  };
}

/** Has the daily cron actually run recently? Reads its own heartbeat. */
async function checkCron(): Promise<Check> {
  const sb = serviceClient();
  if (!sb) return { name: "Scheduled jobs", status: "degraded", detail: "No service role" };
  try {
    const { data, error } = await sb.from("system_status").select("value").eq("key", "cron_last_run").maybeSingle();
    if (error) return { name: "Scheduled jobs", status: "degraded", detail: "Heartbeat table missing — run 2026_system_status.sql" };
    const last = (data as any)?.value;
    if (!last) {
      return { name: "Scheduled jobs", status: "degraded", detail: "Not run since this was deployed — first run is 08:00 IST" };
    }
    const hours = (Date.now() - new Date(String(last)).getTime()) / 3_600_000;
    if (hours > 48) return { name: "Scheduled jobs", status: "down", detail: `Last ran ${Math.round(hours)}h ago` };
    if (hours > 26) return { name: "Scheduled jobs", status: "degraded", detail: `Last ran ${Math.round(hours)}h ago` };
    return { name: "Scheduled jobs", status: "operational", detail: `Last ran ${Math.round(hours)}h ago` };
  } catch (e: any) {
    return { name: "Scheduled jobs", status: "degraded", detail: e?.message };
  }
}

/** Confirms a migration landed, by selecting a column it introduced. */
async function checkSchema(): Promise<Check> {
  const sb = serviceClient();
  if (!sb) return { name: "Schema migrations", status: "degraded", detail: "No service role" };
  const probes: [string, string, string][] = [
    ["organizations", "subscription_ends_at", "2026_hardening"],
    ["finance_ledger", "gst_turnover", "2026_metrics_layer"],
    ["rate_limits", "key", "2026_hardening"],
    ["renewal_notices", "kind", "2026_renewal_notices"],
    ["webhook_endpoints", "secret", "2026_integrations_layer"],
    /*
      These three ship code that degrades quietly when the migration has not
      been run — /referrals says "sign in", the action board renders empty, and
      the billing guard simply is not there. Quiet degradation is right for the
      user and dangerous for the operator, because nothing on the screen
      distinguishes "no referrals yet" from "the table does not exist".

      2026_org_billing_guard is the one that matters. Until it is applied, any
      workspace owner can PATCH their own organizations row and set
      credits_allowance = -1, which switches metering off for their whole
      account. Deploying the code does not close that hole — only running the
      migration does. So the health endpoint says so out loud.
    */
    ["organizations", "referral_code", "2026_referrals"],
    ["invoices", "meta", "2026_invoice_documents"],
    ["quotes", "status", "2026_invoice_documents"],
    ["alerts", "notified_at", "2026_invoice_documents"],
    ["referrals", "status", "2026_referrals"],
    ["action_tasks", "col", "2026_action_board"],
    ["decisions", "title", "2026_action_board"],
  ];
  const missing: string[] = [];
  for (const [table, col, name] of probes) {
    try {
      const { error } = await sb.from(table).select(col).limit(1);
      if (error) missing.push(name);
    } catch { missing.push(name); }
  }
  /*
    The billing guard is a trigger, not a column, so a select cannot see it.
    Probed by attempting the attack in the only harmless way available: update a
    protected column to the value it already holds. The trigger compares with
    `is distinct from`, so an unchanged value passes even when the guard IS
    installed — which means this can only ever tell us the table is reachable.

    So instead we check for the trigger through the catalog, via the same RPC
    used elsewhere if present, and fall back to reporting it as unknown rather
    than claiming it is fine. Never report a security control as present without
    having actually seen it.
  */
  /*
    Three outcomes, not two — and the first version of this collapsed two of
    them into "fine", which is the exact failure this check exists to prevent.

    It was written as: call the RPC, and only report a problem if it returns
    false. So when the helper function was NOT INSTALLED the call errored, the
    catch swallowed it, and the status page said "operational" — reporting a
    security control as present on the strength of a check that never ran. That
    is worse than having no check, because it actively reassures.

    A control that cannot be verified is reported as unverified. Green has to
    mean green.
  */
  /*
    The upsert arbiters. Same shape of problem as the billing guard: invisible
    to a SELECT, and the symptom is a customer being told their invoice could
    not be saved. A partial unique index cannot serve `ON CONFLICT (cols)`, so
    if this is false, saving an invoice and every Shopify/Stripe/Razorpay sync
    write is failing.
  */
  try {
    const { data, error } = await sb.rpc("cortex_upsert_arbiters_ok");
    if (error) {
      missing.push("2026_upsert_arbiter_fix (cannot verify)");
    } else if (data === false) {
      missing.push("2026_upsert_arbiter_fix (UPSERTS BROKEN — invoice save and store sync will fail)");
    }
  } catch {
    missing.push("2026_upsert_arbiter_fix (cannot verify)");
  }

  try {
    const { data, error } = await sb.rpc("cortex_has_billing_guard");
    if (error) {
      missing.push("2026_org_billing_guard (cannot verify — helper not installed)");
    } else if (data === false) {
      missing.push("2026_org_billing_guard (TRIGGER MISSING — billing is bypassable)");
    }
  } catch {
    missing.push("2026_org_billing_guard (cannot verify)");
  }

  const uniq = Array.from(new Set(missing));
  return uniq.length
    ? { name: "Schema migrations", status: "degraded", detail: `Not applied: ${uniq.join(", ")}` }
    : { name: "Schema migrations", status: "operational" };
}

/*
  A 60-second cache in front of the whole fan-out.

  WHY THIS IS NOT OPTIONAL.

  One GET here runs a real Gemini generateContent call, probes every Gemini and
  Veo model, hits api.resend.com, fetches a live Cashfree order with production
  credentials, and runs six database queries — all with cache: "no-store".

  The endpoint is unauthenticated, and /api/badge is documented as embeddable on
  any third-party site with <img src="/api/badge" />. So every page view of
  anyone's status page triggered the full fan-out, and a trivial `while true;
  do curl; done` burns Gemini quota, Resend quota, and gets the account
  throttled by its own providers. Nobody needs sub-minute resolution on whether
  Resend is up.

  Module scope, so it lives as long as the warm lambda. Ephemeral and per
  instance — which is fine: the point is to collapse a burst, not to be a
  distributed cache. A stale entry is served while a refresh is in flight, so a
  thundering herd still only produces one fan-out.
*/
const HEALTH_TTL_MS = 60_000;
let healthCache: { at: number; body: any } | null = null;
let healthInFlight: Promise<any> | null = null;

async function computeHealth() {
  const [db, ai, gen, email, pay, cron, schema] = await Promise.all([
    checkDatabase(), checkAI(), checkGenModels(), checkEmail(), checkPayments(), checkCron(), checkSchema(),
  ]);

  const services: Check[] = [
    { name: "Web app", status: "operational", critical: true },   // it answered, so it's up
    db, ai, gen, pay, email, cron, schema,
    { name: "Credential encryption", status: encryptionAvailable() ? "operational" : "degraded", detail: encryptionAvailable() ? undefined : "ENCRYPTION_KEY not set" },
  ];

  const criticalDown = services.some((s) => s.critical && s.status === "down");
  const anyDegraded = services.some((s) => s.status !== "operational");

  return {
    ok: !criticalDown,
    status: criticalDown ? "down" : anyDegraded ? "degraded" : "operational",
    services,
    updated: new Date().toISOString(),
    criticalDown,
  };
}

/**
 * The cached health snapshot. Exported so /api/badge can read it directly.
 *
 * The badge used to `fetch(new URL("/api/health", req.url))` — a second HTTP
 * round trip into this same deployment, doubling the invocation count and the
 * fan-out for every embedded badge image. Calling the function is the same
 * answer for none of the cost.
 */
export async function getHealth(): Promise<any> {
  const now = Date.now();
  if (healthCache && now - healthCache.at < HEALTH_TTL_MS) return healthCache.body;

  // Collapse concurrent misses into one fan-out.
  if (!healthInFlight) {
    healthInFlight = computeHealth()
      .then((body) => { healthCache = { at: Date.now(), body }; return body; })
      .finally(() => { healthInFlight = null; });
  }
  try {
    return await healthInFlight;
  } catch {
    // Serve a stale snapshot rather than nothing if a probe throws.
    if (healthCache) return healthCache.body;
    throw new Error("health check failed");
  }
}
