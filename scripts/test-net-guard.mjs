/**
 * The SSRF guard, EXECUTED against every spelling of a private address.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * net-guard.ts is one module whose entire correctness is a list of numeric
 * ranges, and it had no test. An architecture audit flagged SSRF on
 * customer-supplied URLs; running the real predicate found four live bypasses
 * that reading the file would not have shown:
 *
 *     https://[::ffff:169.254.169.254]/latest/meta-data/   → ALLOWED
 *     https://[::ffff:127.0.0.1]/                          → ALLOWED
 *     https://[::ffff:10.0.0.1]/                           → ALLOWED
 *     https://[0:0:0:0:0:ffff:169.254.169.254]/            → ALLOWED
 *
 * while the plain `https://169.254.169.254/` was correctly blocked.
 *
 * The cause was subtle in exactly the way a reader forgives. isPrivateV6 had:
 *
 *     const m = s.match(/(?:^::ffff:|^::)(\d+\.\d+\.\d+\.\d+)$/);
 *
 * with a comment naming `::ffff:169.254.169.254` as the thing it stops. The
 * intent was right. But the WHATWG URL parser re-serialises that host to
 * `[::ffff:a9fe:a9fe]` before the guard ever sees it, so the dotted-quad
 * regex never matched on the one path where an attacker picks the string. It
 * DID match on the DNS path, where dns.lookup returns dotted quads — which is
 * why the branch looked like it was working.
 *
 * A guard that is a table of numbers is the canonical case for a table of
 * tests. Reading it twice would not have found this; executing it did.
 *
 * ============================================================================
 * WHAT IS ASSERTED
 * ============================================================================
 *
 * Both directions, because only testing the blocks is how you end up with a
 * guard that refuses wordpress.com. That is not hypothetical either — the
 * file carries a comment about a previous 192.0.0.0/16 over-block that broke
 * every WordPress.com-hosted endpoint and retried into the same wall forever.
 */

import { assertPublicUrl, isPrivateAddress, BlockedUrlError } from "../src/lib/net-guard.ts";

let pass = 0;
const failures = [];

async function expect(url, want, why = "") {
  let got;
  try { await assertPublicUrl(url); got = "allow"; }
  catch (e) { got = e instanceof BlockedUrlError ? "block" : "block"; }
  if (got === want) { pass++; return; }
  failures.push(`${url}\n      wanted ${want}, got ${got}${why ? " — " + why : ""}`);
}

/* ========================================================================= */
/* 1. THE FOUR THAT WERE LIVE, AND EVERY OTHER SPELLING OF THEM              */
/* ========================================================================= */

/*
  Each of these is the same address written differently. A guard that reasons
  about the STRING will catch some and miss others; one that parses to eight
  numbers catches all of them. That is the property under test.
*/
const METADATA = "169.254.169.254";   // AWS / GCP / Azure instance metadata
for (const host of [
  `[::ffff:${METADATA}]`,          // IPv4-mapped, dotted  (RFC 4291)
  "[::ffff:a9fe:a9fe]",            // IPv4-mapped, hex — what the URL parser produces
  `[0:0:0:0:0:ffff:${METADATA}]`,  // uncompressed
  `[::ffff:0:${METADATA}]`,        // IPv4-translated      (RFC 2765)
  `[::${METADATA}]`,               // IPv4-compatible, deprecated but parsed
  `[64:ff9b::${METADATA}]`,        // NAT64                (RFC 6052)
  METADATA,                        // plain, the one that always worked
]) {
  await expect(`https://${host}/latest/meta-data/`, "block",
    "cloud metadata is the highest-value SSRF target there is");
}

for (const host of [
  "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "127.0.0.1", "[::1]",
  "[::ffff:10.0.0.1]", "10.1.2.3",
  "[::ffff:192.168.1.1]", "192.168.0.1",
  "[::ffff:172.16.0.1]", "172.20.1.1",
  "[fc00::1]", "[fd12:3456::1]", "[fe80::1]", "[ff02::1]",
  "100.64.0.1",        // CGNAT
  "0.0.0.0", "192.0.0.1", "192.0.2.5", "224.0.0.1", "255.255.255.255",
]) {
  await expect(`https://${host}/`, "block");
}

/* ========================================================================= */
/* 2. PUBLIC MUST STILL WORK — a guard that blocks everything is not a guard */
/* ========================================================================= */

for (const host of [
  "example.com",
  "wordpress.com",                 // 192.0.78.x — the over-block this file fixed once
  "8.8.8.8",
  "[2606:4700:4700::1111]",        // Cloudflare DNS over v6
  "[::ffff:8.8.8.8]",              // mapped PUBLIC v4 — must NOT be collateral
  "[64:ff9b::8.8.8.8]",            // NAT64 to a public address
  "1.1.1.1",
]) {
  await expect(`https://${host}/`, "allow",
    "refusing a customer's real endpoint is its own outage");
}

/* ========================================================================= */
/* 3. THE REST OF THE CONTRACT                                               */
/* ========================================================================= */

await expect("http://example.com/", "block", "https-only by default");
await expect("file:///etc/passwd", "block");
await expect("gopher://example.com/", "block");
await expect("ftp://example.com/", "block");
await expect("https://user:pw@example.com/", "block", "credentials in the URL");
await expect("https://localhost/", "block");
await expect("https://foo.local/", "block");
await expect("https://nodots/", "block", "a dotless host is an internal name");
await expect("not a url", "block");
await expect("", "block");

/* ========================================================================= */
/* 3b. THE PREDICATE ITSELF MUST FAIL CLOSED                                 */
/* ========================================================================= */

/*
  assertPublicUrl cannot reach these: the WHATWG parser rejects a malformed
  v6 literal before the guard sees it, and dns.lookup only ever returns valid
  addresses. But isPrivateAddress is EXPORTED, so "unparseable means private"
  is part of its contract to any future caller, and a mutation flipping it to
  `return false` survived the URL-level probes above.

  Refusing what we cannot parse is the only safe direction for a function
  whose answer gates an outbound request.
*/
for (const junk of [
  "gggg::1", "[:::1]", "1:2:3:4:5:6:7:8:9", "12345::1",
  "::ffff:999.1.1.1", "not-an-address", "", "::ffff:1.2.3", "1::2::3",
]) {
  const got = isPrivateAddress(junk);
  got === true ? pass++ : failures.push(
    `isPrivateAddress(${JSON.stringify(junk)}) refuses what it cannot parse\n      ` +
    "got false — an unparseable address must never be treated as public");
}

/* And the mapped forms, asserted on the predicate directly as well. */
for (const [ip, want] of [
  ["::ffff:169.254.169.254", true], ["::ffff:a9fe:a9fe", true],
  ["::ffff:8.8.8.8", false],       ["::ffff:808:808", false],
  ["2606:4700:4700::1111", false],
]) {
  isPrivateAddress(ip) === want ? pass++ : failures.push(
    `isPrivateAddress(${JSON.stringify(ip)}) === ${want}`);
}

/* ========================================================================= */
/* 4. THE SOURCE CONTRACT: a default deadline, and no unguarded fetch        */
/* ========================================================================= */

import { readFileSync, readdirSync } from "node:fs";
const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

{
  const g = strip(read("src/lib/net-guard.ts"));
  const ok = /timeoutMs = \d/.test(g) && /new AbortController\(\)/.test(g);
  ok ? pass++ : failures.push(
    "safeFetch applies a default deadline\n      " +
    "five of six call sites passed no signal; the 5s DNS race bounds resolution " +
    "only, not the connection or the body read, so a dribbling endpoint held the " +
    "request open indefinitely");

  /*
    DERIVED from the caller's init, not hardcoded. `const hasOwnSignal = true`
    silently disables the whole deadline while leaving every string this test
    used to look for intact — that mutation survived the first version.
  */
  const own = /hasOwnSignal\s*=\s*Boolean\(\(rest as any\)\.signal\)/.test(g);
  own ? pass++ : failures.push(
    "and a caller's own signal still wins\n      " +
    "webhooks.ts sets a tighter 8s; a floor for the forgetful must not become a " +
    "ceiling on the deliberate");
}

/*
  Every customer-influenced outbound call must go through safeFetch. Listed by
  file rather than inferred, because the question "is this URL customer
  controlled?" is not answerable by a regex — but "did this file stop using
  the guard?" is.
*/
for (const [f, why] of [
  ["src/lib/webhooks.ts", "endpoint URL is registered by the customer"],
  ["src/lib/actions.ts", "importFromUrl takes a URL from a form field"],
  ["src/lib/sync/index.ts", "Shopify shop domain and Google Sheets URL"],
  ["src/app/api/integrations/route.ts", "Shopify and Slack connect probes"],
]) {
  const s = strip(read(f));
  const ok = /safeFetch\(/.test(s);
  ok ? pass++ : failures.push(`${f.replace("src/", "")} still fetches through safeFetch\n      ${why}`);
}

/* ========================================================================= */
/* 5. SECRETS: one standard, not three                                       */
/* ========================================================================= */

/*
  The audit asked for integration tokens under envelope encryption. They were
  already AES-256-GCM and fail-closed — but webhook_endpoints.secret was
  plaintext, leaving one codebase with three standards for three secrets:

      api_keys.key              SHA-256 hash (never recoverable)
      integrations.credentials  AES-256-GCM
      webhook_endpoints.secret  plaintext

  The webhook secret cannot be hashed — it has to be reproduced to sign every
  delivery — but nothing stopped it using the same envelope, and nothing did.
*/
{
  const w = strip(read("src/lib/webhooks.ts"));
  const a = strip(read("src/lib/actions.ts"));
  const d = strip(read("src/lib/data.ts"));

  const t = (c, n, why = "") => (c ? pass++ : failures.push(`${n}${why ? "\n      " + why : ""}`));

  t(/export function storeSecret/.test(w) && /encryptSecret\(/.test(w),
    "the webhook signing secret is encrypted before storage");
  t(/export function usableSecret/.test(w) && /startsWith\("v1\."\)/.test(w),
    "and reads back both shapes",
    "rows registered before this are plaintext; a migration-free dual read is " +
    "what lets them keep signing");
  t(/const stored = storeSecret\(newSecret\(\)\)/.test(a) && /if \(!stored\)/.test(a),
    "creating an endpoint refuses rather than storing plaintext",
    "silently downgrading to plaintext when ENCRYPTION_KEY is absent would " +
    "re-create the exact state being fixed");
  t(/const signingKey = usableSecret\(endpoint\.secret\)/.test(w) && /sign\(signingKey,/.test(w),
    "delivery signs with the decrypted key, never the stored ciphertext");
  t(/if \(!signingKey\)/.test(w) && /could not be read/.test(w),
    "and an unreadable secret fails the delivery visibly",
    "signing with ciphertext produces a signature the receiver rejects forever " +
    "while every delivery still looks sent");
  t(/usableSecret\(r\.secret\)/.test(d),
    "the admin view decrypts for display",
    "otherwise /developers shows v1.<iv>.<tag>.<ct> and the admin pastes that " +
    "into their receiving system as the key");
}

/* ========================================================================= */
/* 6. ONE CREDENTIAL READER, WITH THE ALLOWLIST                              */
/* ========================================================================= */

{
  const sync = strip(read("src/lib/sync/index.ts"));
  const t = (c, n, why = "") => (c ? pass++ : failures.push(`${n}${why ? "\n      " + why : ""}`));

  t(!/async function credentialsFor\(/.test(sync),
    "sync/index.ts has no private copy of credentialsFor",
    "it had one, identical in shape to lib/credentials.ts and missing the " +
    "catalogue allowlist that one was given — a security fix applied to one of " +
    "two identical functions");
  t(/from "@\/lib\/credentials"/.test(sync),
    "and imports the canonical, allowlisted reader");

  const creds = strip(read("src/lib/credentials.ts"));
  t(/plaintextOk\.has\(k\)/.test(creds),
    "which reads a plaintext config field only if the catalogue says it is not a password",
    "an unknown key in a plaintext column is the shape of the attack");

  const data = strip(read("src/lib/data.ts"));
  t(!/export async function getIntegrations\(\)/.test(data),
    "the dead ciphertext-selecting reader is gone",
    "zero callers, select(\"*\") on integrations — one wiring away from putting " +
    "every encrypted credential into a page payload");
}

console.log(`\nnet guard: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log("  Every spelling of a private address is refused; public addresses still resolve.");
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
