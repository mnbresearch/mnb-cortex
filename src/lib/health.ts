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
import { coverageVerdict, parseCoverage, COVERAGE_KEY } from "@/lib/cron-coverage";
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

/*
  THE HEALTH ENDPOINT MUST NOT BE ABLE TO OUTLAST ITS OWN ROUTE.

  Found live, with a browser, after this file was last changed: /api/health was
  returning

      504  FUNCTION_INVOCATION_TIMEOUT   after 31,134 ms

  and /status therefore sat on "Checking…" for ever. `maxDuration = 30` on the
  route, and nothing in here was bounded by it.

  This is my regression, and its shape is worth stating plainly. checkAI used
  to end in a hardcoded `return { status: "operational" }` whenever only an
  OpenAI or Anthropic key was configured — a lie, which I replaced with two
  real pings. The lie cost 0ms. The truth costs up to two network round trips,
  and I added them SEQUENTIALLY, to a function already capable of spending
  MODEL_TIMEOUT (20s) in its Gemini loop. The checks run under Promise.all, so
  the endpoint takes as long as its slowest member, and the slowest member
  could now exceed the route's budget on its own.

  A monitoring endpoint that fails when a dependency is slow is worse than
  useless: it converts "one provider is sluggish" into "the whole platform is
  unreachable", which is exactly the false alarm the MODEL_TIMEOUT comment
  above was written to prevent — one layer up.

  So every check now runs under a deadline, and a check that overruns reports
  DEGRADED with a note saying it timed out. Two properties follow:

    - /api/health always answers, in bounded time, whatever any provider does;
    - "we could not measure this" is visible as itself, rather than as either
      a green tick or a dead endpoint.

  10s: comfortably above TIMEOUT (6s) so a normal check is never cut short,
  and far enough below the route's 30s that the JSON assembly after Promise.all
  has room.
*/
const CHECK_DEADLINE = 10_000;

/**
 * Run a check, but never let it exceed the endpoint's budget.
 *
 * A timed-out check is `degraded`, never `down`: we did not observe a failure,
 * we failed to observe. Reporting an unmeasured dependency as down would
 * re-create the false alarm this whole mechanism exists to avoid — and for a
 * `critical` check it would drive a 503.
 */
async function bounded(name: string, run: () => Promise<Check>, ms = CHECK_DEADLINE): Promise<Check> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Check>((resolve) => {
    timer = setTimeout(
      () => resolve({
        name,
        status: "degraded",
        detail: `check did not finish within ${Math.round(ms / 1000)}s — this reports the probe, not the dependency`,
      }),
      ms,
    );
  });
  try {
    return await Promise.race([run(), deadline]);
  } catch (e: any) {
    return { name, status: "degraded", detail: e?.message || "check threw" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

  /*
    OPENAI AND ANTHROPIC ARE PINGED TOO — THEY USED TO BE ASSUMED.

    This function ended with:

        return { name: "AI engine", status: "operational", detail: "provider configured", critical: true };

    reached whenever GEMINI and GROQ are unset but OPENAI_API_KEY or
    ANTHROPIC_API_KEY is. That is `Boolean(process.env.X)` wearing the word
    "operational" — precisely the behaviour this module's own header says was
    removed ("Every check below actually talks to the dependency"). Both keys
    are first-class here: lib/ai/byo.ts treats all four providers equally, so
    this is a configuration a workspace can genuinely be running on, not a
    theoretical branch.

    It is the worst check to fake, because `critical: true` means this one
    drives the 503 that uptime monitors watch. A deployment on an expired
    OpenAI key would report a green AI engine and a 200 for ever, while every
    AI action in the product failed.

    Both are listed rather than one-or-the-other so a deployment holding both
    keys learns which of them is actually answering.
  */
  /*
    IN PARALLEL, NOT ONE AFTER THE OTHER.

    The first version awaited OpenAI and then Anthropic, so a deployment
    holding both keys could spend 2 × TIMEOUT here — and that, on top of the
    Gemini loop's budget, is what took /api/health past its route limit and
    into a 504 in production. Two independent probes have no reason to be
    sequential; the cost is now one round trip, not two.

    Anthropic has no cheap unauthenticated listing that validates a key, so it
    hits /v1/models with the two headers it requires — `anthropic-version` is
    mandatory, or the request is rejected for the wrong reason and a good key
    looks bad.
  */
  const openai = envKey("OPENAI_API_KEY");
  const anthropic = envKey("ANTHROPIC_API_KEY");

  const aiProbes: Array<Promise<{ label: string; r: Awaited<ReturnType<typeof ping>> }>> = [];
  if (openai) {
    aiProbes.push(
      ping("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${openai}` } })
        .then((r) => ({ label: "openai", r })),
    );
  }
  if (anthropic) {
    aiProbes.push(
      ping("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
      }).then((r) => ({ label: "anthropic", r })),
    );
  }

  if (!aiProbes.length) {
    return { name: "AI engine", status: "down", detail: "no provider key configured", critical: true };
  }

  const settled = await Promise.all(aiProbes);
  const win = settled.find((x) => x.r.ok);
  if (win) {
    const slow = win.r.ms > MODEL_SLOW;
    return {
      name: "AI engine",
      status: slow ? "degraded" : "operational",
      detail: slow
        ? `${win.label} — answering, but slowly (${(win.r.ms / 1000).toFixed(1)}s)`
        : win.label,
      critical: true,
    };
  }

  return {
    name: "AI engine",
    status: "down",
    detail: `no provider answered — ${settled.map((x) => `${x.label}: ${x.r.error || `HTTP ${x.r.status}`}`).join("; ")}`,
    critical: true,
  };
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

  /*
    WHAT THIS USED TO DO, AND WHY IT WAS WRONG.

        const r = await ping("https://api.resend.com/domains", …);   // 6s
        return r.ok ? operational
             : { status: 401/403 ? "down" : "degraded", detail: r.error };

    One request, one chance, a 6-second ceiling, and an AbortError became

        Email: degraded — "no response in 6000ms"     (critical: true)

    So a cold TLS handshake on a fresh serverless instance looked exactly like
    an outage of the only enabled collections channel. Nothing was recorded, so
    afterwards nobody could tell whether it had happened once or twenty times;
    and the verdict ignored the one piece of evidence that actually settles the
    question — whether real messages were going out at that moment. The status
    page said critical while the email console listed messages delivered
    minutes earlier. Both were reading the same service.

    THREE CHANGES:

      a SECOND ATTEMPT, so one blip is a blip. The first probe gets a short
      budget (3.5s, well inside the endpoint's own deadline) and a failure is
      confirmed rather than believed;

      a RECORD of every sample — duration, HTTP status, error, correlation id —
      in email_probes, which is what makes a pattern visible and a stale sample
      recognisable as stale;

      a VERDICT that prefers real deliveries. The rules live in
      lib/email-state.ts, where they are executed by tests instead of described
      here: two consecutive failures is a fault, one is not, a 401 is immediate,
      and a sample older than the staleness window is reported as "not measured
      recently" rather than as either good or bad news.
  */
  const correlationId = `probe_${Date.now().toString(36)}`;
  const PROBE_TIMEOUT = 3_500;
  let r = await ping("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }, PROBE_TIMEOUT);
  if (!r.ok && r.status === 0) {
    /* Confirm before accusing. A retry costs one cheap GET and is the
       difference between a false alarm and a finding. */
    r = await ping("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }, PROBE_TIMEOUT);
  }

  const sample = { ok: r.ok, ms: r.ms, status: r.status, at: Date.now(), error: r.error };
  const [history, sends] = await Promise.all([
    recordAndReadProbes(sample, correlationId),
    recentSendOutcomes(),
  ]);

  const { probeVerdict } = await import("@/lib/email-state");
  const v = probeVerdict({
    probes: history,
    acceptedSends: sends.accepted,
    rejectedSends: sends.rejected,
    now: Date.now(),
  });

  /*
    AND TELL SOMEBODY. The incident that prompted all of this was found by a
    person reading the status page by hand; nothing alerted. An email fault is
    an operator incident — it is the only enabled collections channel here —
    so a confirmed fault goes to the operator queue. Only a genuine fault, and
    only when it is not already open, because an alert that arrives on every
    blip is an alert that gets filtered.
  */
  if (v.status !== "operational" && !v.fromDeliveries) {
    void alertEmailFault(v.status, v.detail, correlationId);
  }

  return {
    name: "Email",
    status: v.status,
    detail: `${v.detail} [probe ${correlationId}, measured ${Math.round(v.ageMs / 1000)}s ago]`,
    critical: true,
  };
}

/** Keep the sample, and read back the recent history the verdict needs. */
async function recordAndReadProbes(
  sample: { ok: boolean; ms: number; status: number; at: number; error?: string },
  correlationId: string,
): Promise<Array<{ ok: boolean; ms: number; status: number; at: number; error?: string }>> {
  const sb = serviceClient();
  if (!sb) return [sample];
  try {
    const { error } = await sb.from("email_probes").insert({
      ok: sample.ok, ms: sample.ms, http_status: sample.status || null,
      error: sample.error ? String(sample.error).slice(0, 300) : null,
      correlation_id: correlationId,
    });
    /* Logged, not swallowed: if the table is missing, the verdict silently
       loses its history and falls back to single-sample behaviour — the exact
       thing being fixed — so that must be visible. */
    if (error) console.error("[health] email probe not recorded:", error.message);

    const { data } = await sb.from("email_probes")
      .select("ok, ms, http_status, error, at")
      .order("at", { ascending: false }).limit(5);
    const rows = ((data as any[]) || []).map((p) => ({
      ok: Boolean(p.ok), ms: Number(p.ms) || 0, status: Number(p.http_status) || 0,
      at: new Date(p.at).getTime(), error: p.error || undefined,
    }));
    /* The row we just wrote may not be readable yet; put the live sample first
       either way, deduplicated by timestamp. */
    return [sample, ...rows.filter((p) => Math.abs(p.at - sample.at) > 1000)];
  } catch {
    return [sample];
  }
}

/**
 * What actually happened to real messages in the last quarter of an hour.
 *
 * This is the evidence the old probe did not consult, and the reason the
 * status page could contradict the email console. A provider that has just
 * accepted our mail is not down, whatever a GET to /domains did.
 */
async function recentSendOutcomes(): Promise<{ accepted: number[]; rejected: number[] }> {
  const sb = serviceClient();
  if (!sb) return { accepted: [], rejected: [] };
  try {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data, error } = await sb.from("email_sends")
      .select("status, accepted_at, failed_at, queued_at")
      .gte("queued_at", since).limit(200);
    if (error) return { accepted: [], rejected: [] };
    const accepted: number[] = [];
    const rejected: number[] = [];
    for (const row of ((data as any[]) || [])) {
      const t = new Date(row.accepted_at || row.failed_at || row.queued_at).getTime();
      if (row.status === "accepted" || row.status === "delivered") accepted.push(t);
      else if (row.status === "failed" || row.status === "bounced") rejected.push(t);
      /* `queued` and `unknown` are counted as neither: one is not an outcome
         yet and the other is explicitly "we do not know". Treating either as a
         failure would re-create the false alarm in a new place. */
    }
    accepted.sort((a, b) => b - a);
    rejected.sort((a, b) => b - a);
    return { accepted, rejected };
  } catch {
    return { accepted: [], rejected: [] };
  }
}

/** One operator alert per fault, not one per health check. */
async function alertEmailFault(status: string, detail: string, correlationId: string): Promise<void> {
  try {
    const sb = serviceClient();
    if (!sb) return;
    /* Already open? Say nothing. /api/health is polled by uptime monitors, so
       alerting on every check would mean an email a minute during an incident. */
    const { data: open } = await sb.from("operator_alerts")
      .select("id").eq("kind", "email_provider_fault").is("resolved_at", null)
      .gte("at", new Date(Date.now() - 6 * 3600_000).toISOString()).limit(1);
    if (Array.isArray(open) && open.length > 0) return;

    const { operatorAlert } = await import("@/lib/operator-alert");
    await operatorAlert({
      kind: "email_provider_fault",
      severity: status === "down" ? "red" : "amber",
      title: `Email is ${status}`,
      body: `${detail}. Email is the only enabled collections channel, so reminders, invites, receipts and `
        + `renewal notices are affected. Probe ${correlationId}; the samples are in email_probes and the `
        + `per-message outcomes in email_sends.`,
      email: status === "down",
    });
  } catch (e: any) {
    console.error("[health] could not raise the email fault alert:", e?.message);
  }
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
    /*
      TWO KEYS, ONE ROUND TRIP. `cron_last_run` answers "did it run"; the
      coverage row answers "did it reach everyone", which is the question that
      goes wrong quietly. See below.
    */
    const { data: rows, error } = await sb
      .from("system_status").select("key,value").in("key", ["cron_last_run", COVERAGE_KEY]);
    if (error) return { name: "Scheduled jobs", status: "degraded", detail: "Heartbeat table missing — run 2026_system_status.sql" };
    const at = (k: string) => ((rows as any[]) || []).find((r) => r.key === k)?.value;
    const last = at("cron_last_run");
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

    /*
      RAN IS NOT THE SAME AS REACHED EVERYONE.

      Up to here the check only asked whether the cron fired. It can fire
      perfectly every night and still be covering a shrinking fraction of the
      platform: the sweep is capped at 200 workspaces a night and rotates, so at
      201 customers every warning becomes up to 48 hours late while this check
      stays green and says "Last ran 6h ago".

      That is the failure mode that arrives WITH success, which is exactly the
      kind nobody is watching for. The cron already computed the number; it just
      had nowhere to put it. Now it writes it and this reads it.

      Coverage can only DEGRADE, never mark critical: partial coverage is late
      warnings, not absent ones, and a 503 would take the status page down over
      a capacity planning problem.
    */
    const verdict = coverageVerdict(parseCoverage(at(COVERAGE_KEY)));
    const age = `Last ran ${Math.round(hours)}h ago`;
    return {
      name: "Scheduled jobs",
      status: verdict.status === "degraded" ? "degraded" : "operational",
      detail: verdict.detail ? `${age} · ${verdict.detail}` : age,
    };
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
    /*
      BOTH COLUMNS, because one of them is load-bearing for the most important
      path in the product.

      This probed `meta` alone, and on production `meta` came back unreadable
      while quotes.status and alerts.notified_at were fine — a half-applied
      2026_invoice_documents.sql. That is already worth reporting, but it
      understated the problem: the same file adds `issue_date`, and
      `issue_date` is a member of IMPORT_COLS.invoices, so the importer maps it
      on EVERY invoice import. A missing column there is not a degraded
      feature, it is a rejected insert — the primary onboarding action failing
      outright.

      PostgREST fails the select if either column is absent, so this is one
      round trip that now cannot report "fine" while the import is broken.
    */
    ["invoices", "meta, issue_date", "2026_invoice_documents"],
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
    /*
      COLUMN NAMES HERE ARE REAL ONES, AND TWO OF THESE WERE NOT.

      I wrote `metric_snapshots.captured_at` and `platform_switches.enabled`
      from memory. The actual columns are `as_of` and `collections_enabled`.
      Both probes therefore failed against a perfectly healthy database, and
      /api/health spent a day reporting

          Schema migrations: degraded — Not applied: RUN-2026-09-05.sql

      about a file that HAD been applied. Which is worse than the gap this
      probe list was added to close: a check that cries wolf gets switched off,
      and it took the operator and me on a hunt for a missing collections
      subsystem that was never missing.

      scripts/test-schema-probes.mjs now resolves every probed column against
      the CREATE TABLE and ALTER TABLE text in supabase/, so an invented name
      fails the suite instead of failing production.
    */
    ["metric_snapshots", "as_of", "RUN-2026-09-05.sql"],
    ["platform_switches", "collections_enabled", "RUN-2026-09-05.sql"],
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
  /*
    CONCURRENT, BECAUSE SEQUENTIAL WAS TIMING THE CHECK OUT.

    This was a `for` loop with an `await` in the body: one round trip per
    probe, 24 of them, then two RPCs — 26 serial hops inside the 10-second
    CHECK_DEADLINE that bounded() imposes. At a routine 400ms per hop that is
    10.4s, and bounded() reports an overrun as DEGRADED.

    Which is what production started doing. /api/health went from
    "Schema migrations: operational" to "degraded" with no migration having
    changed and no probed column having moved — while the endpoint's own
    wall time crept from 12.1s to 13.5s. A check slow enough to miss its own
    deadline reports the schema as broken when the schema is fine.

    That is the failure this file already warns about, two screens up, in its
    own words: "a check that cries wolf gets switched off, and it took the
    operator and me on a hunt for a missing collections subsystem that was
    never missing." I then wrote the sequential loop that made it cry wolf.

    Every probe is independent — a SELECT of one column on one table, no
    ordering between them — so there was never a reason to serialise. 26 hops
    become one round trip's worth of latency, which puts the check back inside
    its budget with room to spare rather than tuning the deadline up and
    waiting for the next creep.

    `missing` is rebuilt from the settled results rather than pushed to from
    inside the callbacks, so the order stays the probe order and the operator's
    report does not reshuffle itself between runs.
  */
  const results = await Promise.all(probes.map(async ([table, col, name]) => {
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
      return error ? `${name} (${table}.${col.split(",")[0].trim()} unreadable)` : null;
    } catch { return `${name} (${table} — probe threw)`; }
  }));
  const missing: string[] = results.filter((r): r is string => r !== null);
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
  /*
    Each under its own deadline — see `bounded`. The model checks get the
    longer MODEL_TIMEOUT-shaped budget they were designed for, plus a small
    margin, because a slow model is a real and expected state; everything else
    lives inside CHECK_DEADLINE.
  */
  const [db, ai, gen, email, pay, cron, schema] = await Promise.all([
    bounded("Database", checkDatabase),
    bounded("AI engine", checkAI, MODEL_TIMEOUT + 2_000),
    bounded("Image & video models", checkGenModels, MODEL_TIMEOUT + 2_000),
    bounded("Email delivery", checkEmail),
    bounded("Payments", checkPayments),
    bounded("Scheduled jobs", checkCron),
    bounded("Schema migrations", checkSchema),
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
/* ===========================================================================
   THE CACHE HAS TO BE SHARED, BECAUSE THE PROCESS IS NOT.

   `healthCache` is module state, and module state on Vercel lives inside ONE
   warm lambda instance. Measured against production:

       hit 1 (cold instance)  7,785 ms
       hit 2 (same instance)  1,511 ms
       hit 3 (same instance)    905 ms
       a later cold instance  9,106 ms

   So the cache works exactly as written and protects almost nothing: every
   cold start, every scale-out, every deploy re-runs all ten probes. That is
   two model calls, a Resend call, a Cashfree call and several Supabase queries,
   on an endpoint that requires no authentication — so the cost is not just
   latency, it is Gemini and Resend quota spendable by anyone with curl and a
   loop. The header of this file says the cache exists "to stop this
   unauthenticated endpoint from spending Gemini and Resend quota on every
   request"; per-instance, it does not.

   `system_status` is already the table this file reads the cron heartbeat
   from, so a shared snapshot costs no migration and one extra key.

   ORDER OF PREFERENCE, and why:

     1. in-memory, if fresh — free, and correct within the instance;
     2. the shared row, if fresh — one indexed primary-key read (~50ms) instead
        of ten network probes, and it makes /status instant for every visitor
        rather than for whoever happens to land on a warm instance;
     3. compute, then write the row back for everyone else.

   The snapshot is never allowed to make things worse: every DB interaction
   here is wrapped, and a failure falls through to computing, which is exactly
   what happened before this existed.
   =========================================================================== */
const HEALTH_SNAPSHOT_KEY = "health_snapshot";

/** The shared snapshot, if it is fresh. Null on any doubt. */
async function readSharedSnapshot(): Promise<any | null> {
  try {
    const sb = serviceClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from("system_status").select("value,updated_at").eq("key", HEALTH_SNAPSHOT_KEY).maybeSingle();
    if (error || !data) return null;
    const raw = (data as any).value;
    if (typeof raw !== "string" || !raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || typeof snap.at !== "number" || !snap.body) return null;
    if (Date.now() - snap.at >= HEALTH_TTL_MS) return null;
    /*
      `fresh_for_ms` is added on the way out so an operator reading
      /api/health can tell a shared snapshot from a first-hand measurement.
      A status page that cannot say how old its numbers are is the thing this
      whole file was written to stop being.
    */
    return { ...snap.body, snapshot_age_ms: Date.now() - snap.at };
  } catch { return null; }
}

/** Publish the snapshot for other instances. Best-effort, never fatal. */
async function writeSharedSnapshot(body: any): Promise<void> {
  try {
    const sb = serviceClient();
    if (!sb) return;
    const nowIso = new Date().toISOString();
    const { error } = await sb.from("system_status").upsert(
      { key: HEALTH_SNAPSHOT_KEY, value: JSON.stringify({ at: Date.now(), body }), updated_at: nowIso },
      { onConflict: "key" },
    );
    // Logged, not swallowed: supabase-js returns {error} rather than throwing,
    // and a snapshot that silently never publishes would look exactly like a
    // working shared cache while every instance paid full price.
    if (error) console.error("[health] snapshot not published —", error.message);
  } catch (e: any) {
    console.error("[health] snapshot write threw —", e?.message);
  }
}

export async function getHealth(): Promise<any> {
  const now = Date.now();
  if (healthCache && now - healthCache.at < HEALTH_TTL_MS) return healthCache.body;

  // A cold instance asks the shared row before spending ten probes on it.
  const shared = await readSharedSnapshot();
  if (shared) {
    healthCache = { at: Date.now(), body: shared };
    return shared;
  }

  // Collapse concurrent misses into one fan-out.
  if (!healthInFlight) {
    healthInFlight = computeHealth()
      .then(async (body) => {
        healthCache = { at: Date.now(), body };
        await writeSharedSnapshot(body);
        return body;
      })
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
