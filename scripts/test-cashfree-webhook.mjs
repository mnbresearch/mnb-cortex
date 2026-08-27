#!/usr/bin/env node
/**
 * Cashfree webhook verification tests.  Run: npm run test:cashfree
 *
 * WHY THIS SUITE EXISTS AT ALL
 *
 * A webhook that rejects real deliveries takes the customer's money and never
 * fulfils the order. The failure is silent from inside the app — Cashfree shows
 * a 401 in its own logs and the customer just sees nothing happen.
 *
 * And it hides from testing in a very specific way: Cashfree sends
 * `x-webhook-timestamp` in epoch MILLISECONDS (13 digits), while a hand-written
 * test request is almost always built with `date +%s` or
 * `Math.floor(Date.now()/1000)` — SECONDS. Any age check that assumes seconds
 * therefore passes every manual test and rejects every real delivery.
 *
 * So the central case below signs with a REAL 13-digit millisecond timestamp.
 * Several others assert the failure REASON rather than just "rejected", because
 * "wrong secret", "missing header", "re-serialised body" and "clock skew" all
 * look identical from outside and each has a different fix.
 */

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "cortex-cashfree-"));

try {
  execFileSync(join(ROOT, "node_modules", ".bin", "tsc"), [
    "src/lib/pay/cashfree-webhook.ts", "--outDir", out,
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
  ], { cwd: ROOT, stdio: "inherit" });
} catch { console.error("Could not compile src/lib/pay/cashfree-webhook.ts"); process.exit(1); }

const { verifyCashfreeWebhook, toEpochSeconds, DEFAULT_MAX_AGE_SECONDS } =
  await import(join(out, "cashfree-webhook.js"));

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

const SECRET = "cfsk_ma_prod_EXAMPLE_not_a_real_secret_000000";
const sign = (ts, body, secret = SECRET) =>
  createHmac("sha256", secret).update(String(ts) + body).digest("base64");

/* Exactly what Cashfree posts: compact JSON, no trailing newline. */
const BODY = JSON.stringify({
  type: "PAYMENT_SUCCESS_WEBHOOK",
  data: { order: { order_id: "cortex_growth_abc123" }, payment: { cf_payment_id: "5114910" } },
});

console.log("\nThe real-caller case: a 13-digit MILLISECOND timestamp");
{
  const ms = Date.now();                                  // 13 digits, as Cashfree sends
  check("the fixture really is 13 digits", String(ms).length === 13);
  const r = verifyCashfreeWebhook({ rawBody: BODY, signature: sign(ms, BODY), timestamp: String(ms), secret: SECRET });
  check("a genuine millisecond delivery is ACCEPTED", r.ok === true);
  check("...and its age is ~0 seconds, not 1.79 trillion", r.ok && r.ageSeconds < 5);
}

console.log("\nThe case that made the bug invisible: a 10-digit SECONDS timestamp");
{
  const secs = Math.floor(Date.now() / 1000);             // what a hand-built test sends
  check("the fixture really is 10 digits", String(secs).length === 10);
  const r = verifyCashfreeWebhook({ rawBody: BODY, signature: sign(secs, BODY), timestamp: String(secs), secret: SECRET });
  check("a seconds timestamp is also accepted (so manual tests keep working)", r.ok === true);
}

console.log("\nMagnitude normalisation");
check("13-digit millis convert to seconds", Math.abs(toEpochSeconds("1787814895250") - 1787814895.25) < 0.01);
check("10-digit seconds are left alone", toEpochSeconds("1787814895") === 1787814895);
check("non-numeric is rejected", toEpochSeconds("not-a-timestamp") === null);
check("empty is rejected", toEpochSeconds("") === null);
check("zero is rejected", toEpochSeconds("0") === null);

console.log("\nThe signature must be over the RAW header string, never the normalised value");
{
  const ms = Date.now();
  // Signing with the SECONDS form while sending the MILLISECOND header is what
  // happens if someone "helpfully" normalises before hashing.
  const wrong = sign(Math.floor(ms / 1000), BODY);
  const r = verifyCashfreeWebhook({ rawBody: BODY, signature: wrong, timestamp: String(ms), secret: SECRET });
  check("hashing the normalised timestamp instead of the raw header is rejected", !r.ok && r.reason === "signature_mismatch");
}

console.log("\nThe body must be the raw bytes");
{
  const ms = Date.now();
  const sig = sign(ms, BODY);
  // JSON.parse → JSON.stringify with different spacing: same data, different bytes.
  const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
  const r = verifyCashfreeWebhook({ rawBody: reserialised, signature: sig, timestamp: String(ms), secret: SECRET });
  check("a re-serialised body is rejected", !r.ok && r.reason === "signature_mismatch");
  check("...and says the body length differed, so the cause is findable", !r.ok && r.detail?.bodyBytes === reserialised.length);
}

console.log("\nSecret handling");
{
  const ms = Date.now();
  const sig = sign(ms, BODY);
  check("an unset secret FAILS CLOSED",
    verifyCashfreeWebhook({ rawBody: BODY, signature: sig, timestamp: String(ms), secret: "" }).reason === "secret_not_configured");
  check("an undefined secret fails closed",
    verifyCashfreeWebhook({ rawBody: BODY, signature: sig, timestamp: String(ms), secret: undefined }).reason === "secret_not_configured");
  check("the wrong secret is rejected",
    verifyCashfreeWebhook({ rawBody: BODY, signature: sig, timestamp: String(ms), secret: "a-different-secret-entirely-0000000000" }).reason === "signature_mismatch");

  /*
    THE ONE THAT MATCHES THIS INCIDENT. A secret pasted into a dashboard with a
    trailing newline is invisible on screen, is tolerated by the HTTP header on
    the order-creation call, and silently breaks every HMAC — presenting exactly
    as "payments work but webhooks 401".
  */
  const r = verifyCashfreeWebhook({ rawBody: BODY, signature: sig, timestamp: String(ms), secret: `${SECRET}\n` });
  check("a secret with a trailing newline still verifies (it is trimmed)", r.ok === true);
  check("a secret with surrounding spaces still verifies", verifyCashfreeWebhook({ rawBody: BODY, signature: sig, timestamp: String(ms), secret: `  ${SECRET}  ` }).ok === true);
}

console.log("\nMissing headers are named, not lumped into 'invalid signature'");
{
  const ms = Date.now();
  check("a missing signature header is named",
    verifyCashfreeWebhook({ rawBody: BODY, signature: "", timestamp: String(ms), secret: SECRET }).reason === "missing_signature_header");
  check("a missing timestamp header is named",
    verifyCashfreeWebhook({ rawBody: BODY, signature: sign(ms, BODY), timestamp: "", secret: SECRET }).reason === "missing_timestamp_header");
  check("a malformed timestamp is named",
    verifyCashfreeWebhook({ rawBody: BODY, signature: sign(ms, BODY), timestamp: "abc", secret: SECRET }).reason === "malformed_timestamp");
}

console.log("\nReplay window");
{
  const now = Date.now();
  const old = now - 40 * 60 * 1000;                       // 40 minutes ago, in millis
  const r = verifyCashfreeWebhook({ rawBody: BODY, signature: sign(old, BODY), timestamp: String(old), secret: SECRET, now });
  check("a 40-minute-old delivery is rejected", !r.ok && r.reason === "timestamp_outside_window");
  check("...and reports it read the header as milliseconds", !r.ok && r.detail?.interpretedAs === "milliseconds");

  // Cashfree reuses the ORIGINAL timestamp on retries and its retry schedule
  // spans several minutes, so a tight window silently drops the later attempts.
  const retry = now - 9 * 60 * 1000;
  check("a 9-minute-old RETRY is still accepted (Cashfree reuses the original timestamp)",
    verifyCashfreeWebhook({ rawBody: BODY, signature: sign(retry, BODY), timestamp: String(retry), secret: SECRET, now }).ok === true);
  check("the default window is at least 15 minutes", DEFAULT_MAX_AGE_SECONDS >= 15 * 60);

  // A clock skewed the other way must not be rejected differently.
  const future = now + 2 * 60 * 1000;
  check("a slightly future timestamp (clock skew) is accepted",
    verifyCashfreeWebhook({ rawBody: BODY, signature: sign(future, BODY), timestamp: String(future), secret: SECRET, now }).ok === true);
}

console.log("\nThe rejection must never leak the secret");
{
  const ms = Date.now();
  const r = verifyCashfreeWebhook({ rawBody: BODY, signature: sign(ms, BODY, "some-other-secret-000000000000000000"), timestamp: String(ms), secret: SECRET });
  const dumped = JSON.stringify(r);
  check("the reason object contains no part of the secret", !dumped.includes(SECRET) && !dumped.includes(SECRET.slice(0, 12)));
  check("it does carry enough to diagnose (prefixes + body length)",
    typeof r.detail?.receivedPrefix === "string" && typeof r.detail?.expectedPrefix === "string");
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed`); process.exit(1); }
console.log(`all ${pass} passed`);
