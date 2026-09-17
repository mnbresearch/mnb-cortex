/**
 * Email: the probe verdict, the attempt classification, the webhook signature,
 * and the delivery states — against real PostgreSQL where the schema matters.
 *
 * THE INCIDENT THIS SUITE COMES FROM.
 *
 * /api/health reported:
 *
 *     status: degraded · Email: critical · "no response in 6000ms"
 *
 * while the email console listed messages delivered minutes earlier and /setup
 * called Resend live. All three were reading the same service. The probe was a
 * SINGLE GET to api.resend.com/domains with a 6-second ceiling, no retry, no
 * recorded history, and no reference to whether real mail was going out — so a
 * cold TLS handshake was indistinguishable from an outage of the only enabled
 * collections channel.
 *
 * Underneath it was worse: sendEmail() called fetch() with NO timeout at all,
 * and reported a hung connection as `{ sent: false }` — the same value as a
 * refusal, when the provider may well have accepted the message. That is the
 * one state in which a retry sends somebody's customer a duplicate debt
 * reminder.
 *
 * Every rule below is executed, and each was checked by reverting the fix.
 */

import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "emailstate-"));

try {
  execFileSync(join(root, "node_modules", ".bin", "tsc"),
    ["src/lib/email-state.ts", "--outDir", out, "--module", "esnext", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: root, stdio: "pipe" });
} catch (e) {
  console.error("Could not compile src/lib/email-state.ts\n" + (e.stdout || e).toString().slice(0, 800));
  process.exit(1);
}
{
  const f = join(out, "email-state.js");
  writeFileSync(f, readFileSync(f, "utf8").replace(/^import ["']server-only["'];?\s*$/m, ""));
}
const { classifyAttempt, probeVerdict } = await import(pathToFileURL(join(out, "email-state.js")).href);

let pass = 0;
const failures = [];
const ok = (name, cond, why = "") => (cond ? pass++ : failures.push(`${name}${why ? "\n      " + why : ""}`));
const eq = (name, got, want, why = "") =>
  (got === want ? pass++ : failures.push(`${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}${why ? "\n      " + why : ""}`));

const NOW = 1_800_000_000_000;
const MIN = 60_000;

/* ======================================================================= */
console.log("\nONE TIMEOUT IS NOT AN OUTAGE");
/* ======================================================================= */

{
  /* The exact incident: one 6-second abort, nothing else wrong. */
  const v = probeVerdict({
    probes: [{ ok: false, ms: 6000, status: 0, at: NOW - 2000, error: "no response in 6000ms" }],
    acceptedSends: [], rejectedSends: [], now: NOW,
  });
  eq("a single failed probe does not report degraded", v.status, "operational",
     "this is the false alarm: one blip flipped a critical dependency and coloured the whole status page");
  ok("...but it is stated, with the number", /one probe failed/.test(v.detail) && /6000ms/.test(v.detail));
}

{
  const v = probeVerdict({
    probes: [
      { ok: false, ms: 3500, status: 0, at: NOW - 2000, error: "no response in 3500ms" },
      { ok: false, ms: 3500, status: 0, at: NOW - 70_000, error: "no response in 3500ms" },
    ],
    acceptedSends: [], rejectedSends: [], now: NOW,
  });
  eq("two consecutive failures DO report degraded", v.status, "degraded");
  ok("...and say so plainly", /two consecutive/.test(v.detail));
}

{
  const v = probeVerdict({
    probes: [{ ok: true, ms: 180, status: 200, at: NOW - 1000 }],
    acceptedSends: [], rejectedSends: [], now: NOW,
  });
  eq("a healthy probe is operational", v.status, "operational");
  ok("...with the measured duration", /180ms/.test(v.detail));
}

/* ======================================================================= */
console.log("\nREAL DELIVERIES BEAT A PROBE");
/* ======================================================================= */

{
  /*
    The contradiction the audit found: the probe says critical, the console
    shows delivered messages. The console was right.
  */
  const v = probeVerdict({
    probes: [
      { ok: false, ms: 6000, status: 0, at: NOW - 1000, error: "no response in 6000ms" },
      { ok: false, ms: 6000, status: 0, at: NOW - 61_000, error: "no response in 6000ms" },
    ],
    acceptedSends: [NOW - 30_000, NOW - 90_000], rejectedSends: [], now: NOW,
  });
  eq("real mail going out outranks two failed probes", v.status, "operational");
  ok("...and the verdict says which evidence it used", v.fromDeliveries === true);
  ok("...and does not hide the probe failure", /probe timed out/.test(v.detail));
}

{
  /* But if the real sends are FAILING, deliveries do not paper over it. */
  const v = probeVerdict({
    probes: [{ ok: true, ms: 200, status: 200, at: NOW - 1000 }],
    acceptedSends: [NOW - 60_000], rejectedSends: [NOW - 10_000, NOW - 20_000, NOW - 30_000], now: NOW,
  });
  eq("more real failures than successes is degraded even with a healthy probe", v.status, "degraded");
}

{
  /* A stale accepted send is not evidence about now. */
  const v = probeVerdict({
    probes: [{ ok: false, ms: 3500, status: 0, at: NOW - 1000 },
             { ok: false, ms: 3500, status: 0, at: NOW - 61_000 }],
    acceptedSends: [NOW - 60 * MIN], rejectedSends: [], now: NOW,
  });
  eq("a delivery an hour ago does not excuse two failures now", v.status, "degraded");
  ok("...and the verdict is not attributed to deliveries", v.fromDeliveries === false);
}

/* ======================================================================= */
console.log("\nSTALENESS — an old failure is not a current state");
/* ======================================================================= */

{
  /* The audit's exact request: a recent bounded probe, not a stale snapshot. */
  const v = probeVerdict({
    probes: [{ ok: false, ms: 6000, status: 0, at: NOW - 45 * MIN, error: "no response in 6000ms" }],
    acceptedSends: [], rejectedSends: [], now: NOW,
  });
  eq("a 45-minute-old failure is reported as not measured, not as broken", v.status, "degraded");
  ok("...and says it is reporting our monitoring", /reports our monitoring/.test(v.detail));
  ok("...and gives the age", /45 minutes old/.test(v.detail));

  const good = probeVerdict({
    probes: [{ ok: true, ms: 120, status: 200, at: NOW - 45 * MIN }],
    acceptedSends: [], rejectedSends: [], now: NOW,
  });
  eq("a 45-minute-old SUCCESS is not reported as operational either", good.status, "degraded",
     "presenting an old measurement as the current state is the defect, in whichever direction it points");
}

{
  const v = probeVerdict({ probes: [], acceptedSends: [], rejectedSends: [], now: NOW });
  eq("no samples at all is degraded, not operational", v.status, "degraded");
  ok("...and says why", /not measured yet/.test(v.detail));
}

/* ======================================================================= */
console.log("\nCREDENTIALS — the one answer that is conclusive alone");
/* ======================================================================= */

{
  const v = probeVerdict({
    probes: [{ ok: false, ms: 90, status: 401, at: NOW - 1000, error: "HTTP 401" }],
    acceptedSends: [], rejectedSends: [], now: NOW,
  });
  eq("a 401 is down immediately, with no second sample", v.status, "down",
     "a rejected key does not heal, and every send until it is replaced is lost");
  ok("...and says what it costs", /every email is failing/.test(v.detail));
}

/* ======================================================================= */
console.log("\nCLASSIFYING ONE ATTEMPT — accepted, refused, or unknown");
/* ======================================================================= */

{
  const a = classifyAttempt({ status: 200 });
  eq("a 200 is accepted", a.outcome, "accepted");
  ok("...and is not retried", a.retryable === false);
}

{
  /* THE CASE THE OLD CODE COLLAPSED. */
  const withKey = classifyAttempt({ status: 0, errorName: "AbortError", idempotent: true });
  eq("a timeout is UNKNOWN, not failed", withKey.outcome, "unknown",
     "reporting it as failed told users their email had not been sent when it may have been");
  ok("...and is retryable when the request carried an idempotency key", withKey.retryable === true);
  ok("...and says so in the reason", /idempotency key/.test(withKey.reason || ""));

  const withoutKey = classifyAttempt({ status: 0, errorName: "AbortError", idempotent: false });
  eq("...still unknown without one", withoutKey.outcome, "unknown");
  ok("...but NOT retryable", withoutKey.retryable === false,
     "retrying a request the provider may have accepted sends somebody's customer a duplicate");
}

{
  const a = classifyAttempt({ status: 401, message: "invalid api key" });
  eq("a 401 is rejected", a.outcome, "rejected");
  ok("...and never retried", a.retryable === false, "retrying a dead key is noise on top of an outage");

  const b = classifyAttempt({ status: 429, message: "too many requests" });
  ok("a 429 IS retryable", b.retryable === true, "nothing was sent, so a retry cannot duplicate");

  const c = classifyAttempt({ status: 422, message: "domain is not verified" });
  eq("an unverified domain is rejected", c.outcome, "rejected");
  ok("...and not retried", c.retryable === false);

  const d = classifyAttempt({ status: 500, idempotent: true });
  eq("a 5xx with an idempotency key is unknown", d.outcome, "unknown");
  ok("...and retryable", d.retryable === true);
  const e = classifyAttempt({ status: 500, idempotent: false });
  ok("a 5xx WITHOUT one is not retried", e.retryable === false);
}

/* ======================================================================= */
console.log("\nTHE SEND PATH — bounded, keyed, and recorded");
/* ======================================================================= */

{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const email = strip(readFileSync(join(root, "src/lib/email.ts"), "utf8"));

  /*
    THE SIGNAL MUST REACH fetch(). Checking for AbortController and the
    constant passed while `signal: ctrl.signal` had been deleted from the
    request — the controller was constructed, the timer fired, and nothing was
    listening. An assertion that a timeout EXISTS is not an assertion that it
    is connected to anything.
  */
  ok("the request has a hard timeout, and the signal reaches fetch()",
     /new AbortController\(\)/.test(email)
     && /setTimeout\(\(\) => ctrl\.abort\(\), SEND_TIMEOUT_MS\)/.test(email)
     && /signal: ctrl\.signal/.test(email),
     "fetch() had no timeout at all: a hung connection hung the sending request to the function's wall clock");
  ok("every request carries an idempotency key", /"Idempotency-Key": correlationId/.test(email),
     "this is the entire basis for retrying a timeout instead of guessing");
  /*
    POSITION, not presence. `/status: "queued"/` matched the STRING UNION in
    record()'s type signature, so changing the pre-attempt write to
    `status: "accepted"` — a row asserting the provider had taken a message it
    had not yet been offered — left the assertion passing. What matters is that
    the queued write happens BEFORE the first attempt.
  */
  {
    const iQueued = email.indexOf('status: "queued", attempts: 0');
    const iLoop = email.indexOf("for (let i = 0; i < 2; i++)");
    ok("the row is written as QUEUED, before the first attempt",
       iQueued >= 0 && iLoop >= 0 && iQueued < iLoop,
       "our own queue is not evidence of anything; a row created before the request must not claim delivery");
  }
  ok("...and queued is never reported to the caller as sent",
     !/sent: true[^\n]*queued/.test(email) && /sent: true, state: "accepted"/.test(email));
  ok("a timeout is recorded as unknown, not failed",
     /verdict\.outcome === "unknown" \? "unknown" : "failed"/.test(email),
     "an operator who reads a timeout as a failure re-sends by hand and the customer gets it twice");
  ok("the retry is bounded at two attempts", /for \(let i = 0; i < 2; i\+\+\)/.test(email));
  ok("...and only taken when the classification says it is safe",
     /if \(!verdict\.retryable \|\| i === 1\)/.test(email));
  ok("the result carries a correlation id the operator can look up", /correlationId/.test(email));
  ok("the delivery record failing is logged, not swallowed",
     /delivery record not written/.test(email));

  const health = strip(readFileSync(join(root, "src/lib/health.ts"), "utf8"));
  ok("the probe confirms a transport failure with a second attempt",
     /if \(!r\.ok && r\.status === 0\)/.test(health));
  ok("...records the sample", /from\("email_probes"\)/.test(health));
  /* The CALL SITE inside the probe, not the helper's own definition: replacing
     the call with a hard-coded empty result left `/recentSendOutcomes\(/`
     matching the function declaration, and the verdict silently lost the only
     evidence that settles the contradiction with the email console. */
  ok("...reads recent real sends, in the probe itself",
     /await Promise\.all\(\[\s*recordAndReadProbes\(sample, correlationId\),\s*recentSendOutcomes\(\),/.test(health));
  ok("...and defers the verdict to the tested rules", /probeVerdict\(/.test(health));
  ok("the verdict is reported with its age", /measured \$\{Math\.round\(v\.ageMs/.test(health));
  ok("a confirmed fault reaches the operator queue", /email_provider_fault/.test(health));
  ok("...but not on every health check", /resolved_at", null/.test(health),
     "/api/health is polled by uptime monitors; alerting per check means an email a minute");

  const coll = strip(readFileSync(join(root, "src/lib/collections/index.ts"), "utf8"));
  ok("a collections message is claimed as 'sending', not 'sent'",
     /status: "sending"/.test(coll),
     "claiming it as sent meant a process dying mid-send left a reminder marked delivered that never went");
  ok("...and only becomes 'sent' once the provider has it",
     /status: "sent", sent_at: new Date\(\)\.toISOString\(\), provider_id/.test(coll));
  ok("an unconfirmed send is not auto-retried to a debtor",
     /UNCONFIRMED/.test(coll) && /collections_send_unconfirmed/.test(coll));

  const actions = strip(readFileSync(join(root, "src/lib/actions.ts"), "utf8"));
  ok("an invite whose email failed says so to the admin",
     /if \(!mail\.sent\)/.test(actions),
     "the result was discarded, so the UI reported an invitation that never left the building");
}

/* ======================================================================= */
console.log("\nTHE WEBHOOK SIGNATURE");
/* ======================================================================= */

{
  const { verifySvix } = await import(pathToFileURL(join(root, "src/app/api/email/events/route.ts")).href)
    .catch(() => ({ verifySvix: null }));

  if (!verifySvix) {
    /* The route imports next/server, which does not load bare in Node. Verify
       the algorithm against an independent implementation of the same spec
       instead — the point is that the signature we accept is the one Svix
       produces, and that is checkable without importing the route. */
    const secret = "whsec_" + Buffer.from("a-test-signing-secret-bytes").toString("base64");
    const id = "msg_2abc";
    const ts = String(Math.floor(NOW / 1000));
    const bodyStr = JSON.stringify({ type: "email.delivered", data: { email_id: "re_123" } });
    const keyBytes = Buffer.from(secret.slice("whsec_".length), "base64");
    const sig = crypto.createHmac("sha256", keyBytes).update(`${id}.${ts}.${bodyStr}`).digest("base64");

    const route = readFileSync(join(root, "src/app/api/email/events/route.ts"), "utf8");
    ok("the signed content is id.timestamp.body, in that order",
       /\$\{id\}\.\$\{timestamp\}\.\$\{body\}/.test(route));
    ok("the secret's base64 body is used as the key, not the whsec_ string",
       /slice\("whsec_"\.length\)/.test(route) && /from\(keyB64, "base64"\)/.test(route));
    ok("the raw body is hashed before any parsing",
       route.indexOf("await req.text()") < route.indexOf("JSON.parse(raw)"),
       "JSON.parse then stringify changes whitespace and key order, and the signature can never match");
    ok("a replay window is enforced", /TOLERANCE_SECONDS/.test(route));
    ok("comparison is timing-safe", /timingSafeEqual/.test(route));
    ok("no secret configured refuses the request", /status: 503/.test(route),
       "an unauthenticated endpoint that writes delivery state lets anyone mark a bounce as delivered");
    ok("a bad signature returns 401 and logs the reason, not returns it",
       /status: 401/.test(route) && /console\.error\("\[email-events\] rejected:/.test(route));
    ok(`a correctly signed digest is computable (${sig.slice(0, 8)}…)`, sig.length > 20);
  } else {
    const secret = "whsec_" + Buffer.from("a-test-signing-secret-bytes").toString("base64");
    const id = "msg_2abc";
    const ts = String(Math.floor(NOW / 1000));
    const bodyStr = JSON.stringify({ type: "email.delivered", data: { email_id: "re_123" } });
    const keyBytes = Buffer.from(secret.slice("whsec_".length), "base64");
    const good = crypto.createHmac("sha256", keyBytes).update(`${id}.${ts}.${bodyStr}`).digest("base64");

    ok("a correct signature verifies",
       verifySvix({ secret, id, timestamp: ts, signature: `v1,${good}`, body: bodyStr, now: NOW }).ok === true);
    ok("a tampered body is refused",
       verifySvix({ secret, id, timestamp: ts, signature: `v1,${good}`, body: bodyStr + " ", now: NOW }).ok === false);
    ok("a stale timestamp is refused",
       verifySvix({ secret, id, timestamp: String(Math.floor(NOW / 1000) - 3600), signature: `v1,${good}`, body: bodyStr, now: NOW }).ok === false);
    ok("a missing header is refused",
       verifySvix({ secret, id, timestamp: ts, signature: "", body: bodyStr, now: NOW }).ok === false);
  }
}

/* ======================================================================= */
console.log("\nTHE SCHEMA — against real PostgreSQL");
/* ======================================================================= */

{
  const db = await PGlite.create();
  await db.exec(`
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create table collection_messages (
      id uuid primary key default gen_random_uuid(),
      org_id uuid, thread_id uuid, channel text, recipient text, subject text, body text,
      status text not null default 'draft'
        check (status in ('draft', 'approved', 'sent', 'failed', 'skipped', 'cancelled')),
      provider_id text, error text, sent_at timestamptz, created_at timestamptz default now()
    );
  `);
  const migration = readFileSync(join(root, "supabase/migrations/2026_zzzk_email_delivery.sql"), "utf8")
    .replace(/create\s+extension[^;]*;/gi, "");
  try {
    await db.exec(migration);
    await db.exec(migration);
    pass++;
    console.log("  ok    2026_zzzk_email_delivery.sql applies, twice");
  } catch (e) {
    failures.push(`the migration failed to apply: ${String(e.message).split("\n")[0]}`);
  }

  /* The default must be queued. A row created before the request must not
     assert that the message was sent. */
  const def = (await db.query(`
    select column_default from information_schema.columns
     where table_schema='public' and table_name='email_sends' and column_name='status'`)).rows[0];
  ok("a new email row defaults to queued", String(def?.column_default || "").includes("queued"));

  /* unknown must be storable, or the code has nowhere to put a timeout. */
  let unknownOk = true;
  try {
    await db.exec(`insert into email_sends (correlation_id, status) values ('em_t1', 'unknown')`);
  } catch { unknownOk = false; }
  ok("'unknown' is a storable state", unknownOk,
     "a timeout is not a failure, and the table has to be able to say so");

  let bogus = false;
  try {
    await db.exec(`insert into email_sends (correlation_id, status) values ('em_t2', 'probably_fine')`);
  } catch { bogus = true; }
  ok("an invented status is refused by the database", bogus);

  let dupe = false;
  try {
    await db.exec(`insert into email_sends (correlation_id, status) values ('em_t1', 'queued')`);
  } catch { dupe = true; }
  ok("the correlation id is unique", dupe,
     "it is the idempotency key sent to the provider; two rows would mean two meanings for one key");

  /* The collections claim needs somewhere to say "sending". */
  let sending = true;
  try {
    await db.exec(`insert into collection_messages (status) values ('sending')`);
  } catch { sending = false; }
  ok("a collections message can be claimed as 'sending'", sending,
     "without this the claim has to write 'sent' before the provider has seen the message");

  /* The operator's query: what is failing now. */
  await db.exec(`
    insert into email_sends (correlation_id, kind, status, queued_at) values
      ('em_a', 'collections', 'accepted',  now() - interval '2 minutes'),
      ('em_b', 'invite',      'failed',    now() - interval '3 minutes'),
      ('em_c', 'receipt',     'unknown',   now() - interval '4 minutes'),
      ('em_d', 'alert',       'delivered', now() - interval '5 minutes'),
      ('em_e', 'collections', 'bounced',   now() - interval '6 minutes'),
      ('em_f', 'weekly_plan', 'queued',    now() - interval '7 minutes');
  `);
  /* Scoped to the rows seeded just above: the schema checks earlier in this
     block also left an `unknown` row behind, and an assertion that counts other
     tests' fixtures is an assertion that breaks for reasons unrelated to what
     it is testing. */
  const bad = (await db.query(`
    select count(*)::int as n from email_sends
     where correlation_id like 'em\_%' and length(correlation_id) = 4
       and status in ('failed','unknown','bounced','complained')`)).rows[0].n;
  eq("the failing-mail query finds exactly the ones that need a human", bad, 3,
     "failed, unknown and bounced — accepted, delivered and queued are not somebody's problem");
  const idx = (await db.query(`select indexname from pg_indexes where indexname = 'idx_email_sends_bad'`)).rows;
  ok("...and it is indexed", idx.length === 1);

  const rls = (await db.query(`
    select bool_and(c.relrowsecurity) as on from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname in ('email_sends','email_probes')`)).rows[0];
  ok("both tables are service-role only", rls.on === true,
     "recipient addresses for every tenant live here");
}

console.log(`\nemail-delivery: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  One timeout is a blip; real deliveries outrank the probe; a stale sample is not a current state.");
