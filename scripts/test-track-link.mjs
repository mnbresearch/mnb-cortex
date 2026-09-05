/**
 * The click-tracking redirect must not be an open redirect.
 *
 * WHAT IT WAS.
 *
 * /api/track/click and /api/t/c/[token] are unauthenticated, unrated GET
 * endpoints on our own domain, and both took the destination straight off the
 * query string:
 *
 *     let dest = "https://mnb-cortex.vercel.app";
 *     try { const p = new URL(u);
 *           if (p.protocol === "http:" || p.protocol === "https:") dest = p.toString(); }
 *     catch {}
 *     return NextResponse.redirect(dest, 302);
 *
 * The comment above it read "open-redirect protection". It stops `javascript:`
 * and `data:` — worth doing — but permits any http(s) host, which is an open
 * redirect by definition:
 *
 *     https://cortex.mnbresearch.com/api/track/click?u=https://cortex-billing.example/login
 *
 * That is a phishing link whose first hop is the domain we ask customers to
 * trust with their bank statements and their card. It defeats link scanners
 * that only check the first hop, it carries our name into WhatsApp, and it
 * satisfies every "check the URL before you click" instruction we could give.
 *
 * WHY THE ASSERTIONS BELOW ARE SHAPED THIS WAY.
 *
 * The fix has to keep working for the legitimate case — a customer's campaign
 * linking to the customer's own site, which is an unbounded set of hosts we
 * cannot allowlist. So destinations are HMAC-signed when the email is rendered
 * and verified on click. That means there are two ways to get this wrong, and
 * both are tested: letting an unsigned host through (the hole), and refusing a
 * correctly signed one (breaking every marketing email we send).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "tracklink-"));

/* Compile the REAL module rather than restating its logic here. A test that
   re-implements the check it is testing cannot detect the check being wrong. */
/* `import "server-only"` is a Next.js build-time marker with no Node runtime
   equivalent, so strip it from the compiled copy before importing. */
const stripServerOnly = (f) => {
  const { readFileSync, writeFileSync } = require("node:fs");
  writeFileSync(f, readFileSync(f, "utf8").replace(/^import ["']server-only["'];?\s*$/m, ""));
};

try {
  execFileSync(join(root, "node_modules", ".bin", "tsc"),
    ["src/lib/track-link.ts", "--outDir", out, "--module", "esnext", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: root, stdio: "pipe" });
} catch (e) {
  console.error("Could not compile src/lib/track-link.ts\n" + (e.stdout || e).toString().slice(0, 600));
  process.exit(1);
}

const HOME = "https://cortex.mnbresearch.com";
process.env.NEXT_PUBLIC_APP_URL = HOME;
process.env.LINK_SIGNING_SECRET = "a-test-signing-secret";

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
stripServerOnly(join(out, "track-link.js"));

const { safeDestination, signDestination, trackedUrl } =
  await import(pathToFileURL(join(out, "track-link.js")).href);

let pass = 0;
const failures = [];
const eq = (name, got, want, why = "") =>
  got === want ? pass++ : failures.push(`${name}\n      got:  ${got}\n      want: ${want}${why ? "\n      " + why : ""}`);

/* ------------------------------------------ the attack, in its variations */

const EVIL = "https://cortex-billing.example/login";

eq("an unsigned external destination is refused", safeDestination(EVIL, null), HOME,
   "this is the open redirect itself");
eq("a forged signature is refused", safeDestination(EVIL, "AAAAAAAAAAAAAAAAAAAAAA"), HOME);
eq("a signature lifted from a DIFFERENT url is refused",
   safeDestination(EVIL, signDestination("https://legitimate.example")), HOME,
   "signatures must bind to their own destination, not merely exist");
eq("a truncated signature is refused", safeDestination(EVIL, signDestination(EVIL).slice(0, 8)), HOME);
eq("javascript: is refused even when signed",
   safeDestination("javascript:alert(1)", signDestination("javascript:alert(1)")), HOME,
   "signing is authorisation, not laundering — the scheme check comes first");
eq("data: is refused", safeDestination("data:text/html,<h1>x</h1>", null), HOME);
eq("a missing destination is refused", safeDestination(null, null), HOME);
eq("an unparseable destination is refused", safeDestination("not a url", null), HOME);
eq("a protocol-relative url is refused", safeDestination("//evil.example/x", null), HOME);

/*
  The classic same-origin bypass: a host that merely STARTS with ours.
  A `startsWith` check would pass this; comparing parsed .origin does not.
*/
eq("a lookalike host is not treated as same-origin",
   safeDestination("https://cortex.mnbresearch.com.evil.example/x", null), HOME,
   "startsWith() on the URL string would have let this through");
eq("our origin as a userinfo trick is refused",
   safeDestination("https://cortex.mnbresearch.com@evil.example/x", null), HOME);

/* ------------------------------- and the legitimate cases must still work */

const GOOD = "https://sharma-steel.example/offer?id=7&utm_source=cortex";
eq("a correctly signed external destination is followed",
   safeDestination(GOOD, signDestination(GOOD)), GOOD,
   "if this fails, every campaign link we send goes to our homepage instead");
eq("our own origin needs no signature", safeDestination(HOME + "/dashboard", null), HOME + "/dashboard",
   "an on-origin link cannot phish anyone off our domain");

/* trackedUrl must produce something safeDestination accepts — the two halves
   are used in different files and nothing else checks they agree. */
{
  const url = new URL(trackedUrl(`${HOME}/api/track/click?r=abc`, GOOD));
  eq("trackedUrl round-trips through safeDestination",
     safeDestination(url.searchParams.get("u"), url.searchParams.get("s")), GOOD,
     "the signer and the verifier live in different call sites; if they disagree, links silently break");
}

/* -------------------------------------------------- it must fail CLOSED */

/*
  With no key configured, a signature cannot be verified. The dangerous choice
  is to skip the check ("we cannot verify, so allow"); the right one is to
  refuse, so the failure is a broken link somebody reports rather than a
  silently reopened redirect.
*/
delete process.env.LINK_SIGNING_SECRET;
delete process.env.CRON_SECRET;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
eq("with NO signing key, external destinations are refused",
   safeDestination(GOOD, "anything"), HOME,
   "an unverifiable signature must fail closed, not be skipped");
eq("…but our own origin still works", safeDestination(HOME + "/x", null), HOME + "/x");

/* ------------------------------------- the routes must actually use it */

const { readFileSync } = await import("node:fs");
for (const f of ["src/app/api/track/click/route.ts", "src/app/api/t/c/[token]/route.ts"]) {
  const src = readFileSync(join(root, f), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  pass++; // counted below via the two checks
  if (!/safeDestination\(/.test(code)) failures.push(`${f} calls safeDestination()`);
  if (/protocol === "http:"/.test(code)) {
    failures.push(`${f} still has the old inline scheme check\n      that check allowed any http(s) host, which is the hole`);
  }
}

/* Both link builders must sign, or every legitimate link breaks silently. */
for (const f of ["src/lib/branded-email.ts", "src/lib/mailmerge.ts"]) {
  const src = readFileSync(join(root, f), "utf8");
  if (!/signDestination\(/.test(src)) {
    failures.push(`${f} signs the destinations it builds\n      unsigned links now land on our homepage instead of the customer's site`);
  } else pass++;
}

console.log(`\ntrack-link: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Off-origin redirects require a valid HMAC; signed campaign links still work; fails closed.");
