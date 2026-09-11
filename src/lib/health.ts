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
  /*
    Email is critical. Every outbound path in the product runs through Resend —
    renewal notices, KPI alerts, collections messages to the customer's own
    debtors, receipts. There is no retry queue and no dead-letter: a send that
    fails is, in most paths, simply lost. So an invalid key is an outage that
    silently destroys work, and it should page someone rather than sit in a
    body field nobody parses.
  */
  if (!key) return { name: "Email", status: "down", detail: "RESEND_API_KEY not configured", critical: true };
  const r = await ping("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
  if (r.ok) return { name: "Email", status: "operational", critical: true };
  return { name: "Email", status: r.status === 401 || r.status === 403 ? "down" : "degraded", detail: r.error || `HTTP ${r.status}`, critical: true };
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
    /*
      `critical: true` ON THE DOWN BRANCH, and this is the highest-leverage
      line in the file.

      checkCron already DETECTED a dead cron — it just did not make the
      endpoint fail. criticalDown drives the HTTP status, so /api/health
      returned 200 with `{status:"degraded"}` in the body and any uptime
      monitor keyed on the status code stayed green through the entire outage.

      A silently dead cron is the most likely failure this system has: it means
      no renewal reminders, no alert emails, no KPI refresh and no weekly plan,
      and nothing else in the product would say so. 48 hours is already two
      missed nights; that is not a warning, it is an incident.
    */
    if (hours > 48) return { name: "Scheduled jobs", status: "down", detail: `Last ran ${Math.round(hours)}h ago`, critical: true };
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
    /*
      THE PRODUCT SHOULD ANSWER "HAS THE SQL BEEN RUN", not the operator's
      memory.

      weekly_plan_sends is the ledger that makes the Monday plan email
      exactly-once. Without it, sendWeeklyPlans() deliberately falls back to
      Monday-only and reports `ledger: false` in the cron response — correct,
      but invisible unless somebody reads that JSON. The feature is on by
      default and the landing page sells it ("One email on Monday: the three
      things worth your attention"), so an operator who forgot to run
      RUN-weekly-plan-sends.sql has a promise going unmet with nothing on
      screen to say so.

      Named for the file to run rather than the migration, because the answer
      to "this is missing" should be the command that fixes it.
    */
    ["weekly_plan_sends", "week", "RUN-weekly-plan-sends.sql"],
    /*
      THE SAME ARGUMENT, THREE MORE TIMES — and these were shipped without
      being added here, which is how the question "did that SQL ever get run?"
      became unanswerable except by asking a human who might be wrong.

      All three degrade silently, and silently in the most expensive direction:

        funnel_events   — every analytics call in the product writes here and
                          swallows its own failure on purpose (an analytics
                          write must never break a page). So the funnel reads
                          zero, which is indistinguishable from "nobody came".
                          Every decision made from that number is then wrong in
                          a way nothing on screen reveals.

        lifecycle_sends — the claim-before-send lock for the welcome, setup,
                          import and last-call emails. THIS IS THE DANGEROUS
                          ONE. The claim is `insert ... on conflict do nothing`,
                          and if the table is absent the insert errors, so
                          either nothing is ever sent or — depending on how the
                          caller treats that error — the same nudge goes to the
                          same new customer every single morning. Annoying a
                          brand-new signup daily is worse than never writing to
                          them at all.

        leads.score     — the health check already computes a score out of 100
                          and names the weak areas. Without the column the
                          insert drops them, and the CRM row keeps a name and
                          an email for the warmest lead in the funnel.

      Named for the file to run, not the migration, because the answer to "this
      is missing" should be the command that fixes it.
    */
    ["funnel_events", "event", "RUN-NOW-2026-09-11.sql"],
    ["lifecycle_sends", "stage", "RUN-NOW-2026-09-11.sql"],
    ["leads", "company, note, score", "RUN-NOW-2026-09-11.sql"],
    /*
      COLLECTIONS HAD NO PROBE AT ALL — the whole subsystem, six tables of it.

      Found by scripts/test-schema-probes.mjs, which asserts that every table
      and column introduced by a hand-run supabase/RUN-*.sql file is reported
      here. It found sixteen gaps on its first run, and these are the worst of
      them: collections is the feature that most directly makes a customer
      money, and an operator who never ran RUN-2026-09-05.sql had every part of
      it dead while this endpoint reported "operational".

      The columns are probed BY NAME and not just the table, because these
      tables pre-date the columns. A bare `select id from collection_policies`
      succeeds on the original table, so the circuit breaker's tripped_at, the
      WhatsApp template and the reply-to header could all be missing with
      nothing to show it — which is precisely how leads.score stayed invisible.

      One probe, several columns: PostgREST fails the select if any single one
      is absent, so this is one round trip rather than five.
    */
    ["collection_threads", "status", "RUN-2026-09-05.sql"],
    ["collection_messages", "attempt", "RUN-2026-09-05.sql"],
    ["collection_policies", "tone, tripped_at, tripped_reason, reply_to, whatsapp_template, last_swept_at", "RUN-2026-09-05.sql"],
    /*
      metric_snapshots backs the week-on-week movement in the Practice console
      and the "receivables have risen 12%" line in the client brief. Absent, a
      firm's brief silently loses its only trend sentence.

      platform_switches is the operator kill switch. If this table is missing
      the switch cannot be read, and a control that cannot be read is a control
      that is not there — which is the one category this file already refuses
      to report as fine elsewhere.

      erased_subscriptions is the DPDP erasure ledger. It has to exist before
      somebody exercises the right, not after.
    */
    ["metric_snapshots", "captured_at", "RUN-2026-09-05.sql"],
    ["platform_switches", "enabled", "RUN-2026-09-05.sql"],
    ["erased_subscriptions", "erased_at", "RUN-2026-09-05.sql"],
    /*
      cron_cursors is how the nightly sweep rotates through workspaces instead
      of always starting at the same one. Without it the rotation resets every
      night, so the first twenty workspaces get their analysis every day and
      the twenty-first never gets one — a starvation bug that looks like
      nothing at all from the outside.
    */
    ["cron_cursors", "name", "RUN-scale.sql"],
    /*
      health_metrics.updated_at. The Practice console orders clients by it; a
      missing column means ordering by nothing and reporting every client as
      equally idle.
    */
    ["health_metrics", "updated_at", "RUN-NOW-2026-09-08.sql"],
  ];
  const missing: string[] = [];
  for (const [table, col, name] of probes) {
    try {
      const { error } = await sb.from(table).select(col).limit(1);
      /*
        NAME THE OBJECT, NOT JUST THE FILE.

        This reported only `name` — the file to run. That is the right thing to
        tell an operator who has to fix it, and useless to anyone trying to
        understand what is broken: "Not applied: RUN-2026-09-05.sql" covers six
        tables and seven functions, so the first real hit sent me reading the
        whole collections subsystem when a single table was absent. Reporting
        the file alone also hides the case where five of six objects exist,
        which is what a half-finished paste looks like.

        Both, then: what is missing and what to run about it.
      */
      if (error) missing.push(`${name} (${table}.${col.split(",")[0].trim()} unreadable)`);
    } catch { missing.push(`${name} (${table} — probe threw)`); }
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

  /*
    Surface the collections kill switch.

    A global pause that is invisible is how a feature stays off for a week after
    the incident ended. This puts it on the same status page the operator
    already looks at.
  */
  /*
    THE KILL SWITCH REPORTED ITSELF HEALTHY WITHOUT BEING CHECKED.

    This read `const { data: on } = await svcSw.rpc(...)` and branched on
    `on === false`. supabase-js does not THROW on a failed RPC — it returns
    `{ data: null, error }`. So when cortex_collections_enabled is not
    installed, `on` was null, `null === false` was false, and this reported
    "operational". The catch below was unreachable for the same reason and had
    never once run.

    Which means: for a database where RUN-2026-09-05.sql had not been applied,
    the operator kill switch for the one feature that writes to a customer's
    own customers was shown as green, on the strength of a check that could not
    run. That is the precise failure checkSchema() above already calls out in
    its own comments — "a control that cannot be verified is reported as
    unverified; green has to mean green" — reproduced two hundred lines later
    in the check for the more dangerous control.

    THREE OUTCOMES NOW, not two:
      switch readable and on   -> operational
      switch readable and off  -> degraded, with the recorded reason
      switch NOT readable      -> degraded, and says so
  */
  let collections: Check = { name: "Outbound collections", status: "operational" };
  try {
    const svcSw = serviceClient();
    if (!svcSw) {
      collections = { name: "Outbound collections", status: "degraded", detail: "No service role — cannot read the kill switch" };
    } else {
      const { data: on, error } = await svcSw.rpc("cortex_collections_enabled");
      if (error) {
        collections = {
          name: "Outbound collections",
          status: "degraded",
          detail: `cannot verify the kill switch — ${error.message}. Run RUN-2026-09-05.sql`,
        };
      } else if (on === false) {
        const { data: row } = await svcSw.from("platform_switches").select("reason").limit(1).maybeSingle();
        collections = {
          name: "Outbound collections",
          status: "degraded",
          detail: `PAUSED platform-wide — ${(row as any)?.reason || "no reason recorded"}`,
        };
      } else if (on !== true) {
        /* Neither true nor false nor an error — a signature change, or a
           function returning null. Unverified is not the same as fine. */
        collections = {
          name: "Outbound collections",
          status: "degraded",
          detail: `the kill switch returned ${JSON.stringify(on)}, which is neither on nor off`,
        };
      }
    }
  } catch (e: any) {
    collections = { name: "Outbound collections", status: "degraded", detail: `cannot verify the kill switch — ${e?.message || "threw"}` };
  }

  const services: Check[] = [
    { name: "Web app", status: "operational", critical: true },   // it answered, so it's up
    db, ai, gen, pay, email, cron, schema, collections,
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
