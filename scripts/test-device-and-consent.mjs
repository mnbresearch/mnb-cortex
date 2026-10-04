/*
  THREE THINGS A PORTFOLIO AUDIT FOUND, PINNED SO THEY CANNOT COME BACK.

  Each of these is a one-line edit away from being reintroduced by someone
  with a reasonable motive — "cache the dashboard so it loads faster offline",
  "let me curl the cron with ?secret= to test it", "put the contact consent
  back in the banner so we can email signups". So each is asserted here, by
  EXECUTING the thing where possible and by reading the artefact where not.

  Run: node scripts/test-device-and-consent.mjs
*/
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => {
  if (cond) pass++;
  else fails.push(detail ? `${name}\n      ${detail}` : name);
};

/* ===================================================================== */
/* 1. THE SERVICE WORKER MUST NOT KEEP THE WORKSPACE ON THE DEVICE       */
/* ===================================================================== */
/*
  The old handler cached every same-origin GET: /api/* JSON and every
  server-rendered page. Signing out clears the cookie, not Cache Storage, so
  the next person on a shared machine could read the previous workspace's
  receivables offline.

  This is EXECUTED, not grepped. The isCacheable() predicate is lifted out of
  public/sw.js and run against real URLs, because a test that greps for
  "/api/" passes against a handler that mentions it in a comment and still
  caches it — the failure mode two assertions in test-net-guard.mjs had
  before they were tightened.
*/
const swSrc = read("public/sw.js");
{
  const start = swSrc.indexOf("function isCacheable(");
  check(start !== -1, "sw: isCacheable() exists",
    "the allowlist predicate is gone — the worker is probably caching everything again");

  let isCacheable = null;
  if (start !== -1) {
    /* Scan to the brace that closes the declaration. */
    let i = swSrc.indexOf("{", start), depth = 0, end = -1;
    for (; i < swSrc.length; i++) {
      if (swSrc[i] === "{") depth++;
      else if (swSrc[i] === "}" && --depth === 0) { end = i + 1; break; }
    }
    const body = swSrc.slice(start, end);
    /*
      Two free identifiers: `location` and OFFLINE_URL. Stub the first; take
      the second from the file rather than hardcoding it, so renaming the
      offline route cannot make this test quietly assert the wrong path.
    */
    const offline = (swSrc.match(/const OFFLINE_URL = "([^"]+)"/) || [])[1];
    check(Boolean(offline), "sw: OFFLINE_URL is declared and readable");
    // eslint-disable-next-line no-new-func
    isCacheable = new Function("location", "OFFLINE_URL", `${body}; return isCacheable;`)(
      { origin: "https://cortex.mnbresearch.com" },
      offline || "/offline",
    );
  }
  check(typeof isCacheable === "function", "sw: isCacheable() is extractable and callable");

  if (typeof isCacheable === "function") {
    const U = (p) => new URL(p, "https://cortex.mnbresearch.com");

    /* MUST NOT be cached — every one of these carries workspace data. */
    const never = [
      "/api/health", "/api/report", "/api/chat", "/api/v1/metrics",
      "/dashboard", "/receivables", "/payables", "/customers", "/collections",
      "/data?table=invoices", "/settings", "/billing", "/practice",
      "/", "/pricing",                      // public pages: no benefit, and they change
    ];
    for (const p of never) {
      check(!isCacheable(U(p)), `sw: does NOT cache ${p}`,
        "this response is written to Cache Storage and survives sign-out");
    }

    /* MUST still be cached, or installing the app buys nothing. */
    const always = [
      "/_next/static/chunks/main-abc123.js",
      "/_next/static/css/app.css",
      "/icon.svg", "/apple-icon.png", "/offline",
      "/manifest.webmanifest",
      "/fonts/inter.woff2",
    ];
    for (const p of always) {
      check(isCacheable(U(p)), `sw: still caches ${p}`,
        "the app shell no longer loads from cache — the PWA is pointless");
    }

    /* Cross-origin must never be cached, whatever the path looks like. */
    check(!isCacheable(new URL("https://evil.example/_next/static/x.js")),
      "sw: refuses a cross-origin URL even when the path looks static");
  }

  /* The cache version must have moved, or existing devices keep the old data. */
  check(/const CACHE = "mnb-cortex-v([4-9]|\d{2,})"/.test(swSrc),
    "sw: CACHE name bumped past v3",
    "without a new name the old cache — which holds API responses — is never replaced");
  check(/caches\.keys\(\)/.test(swSrc) && /caches\.delete\(/.test(swSrc),
    "sw: activate deletes previous caches",
    "the fix must reach devices that already hold the old data, not just new installs");

  /* And the claim that depended on the old behaviour must be gone. */
  const help = read("src/app/help/page.tsx");
  check(!/works offline/i.test(strip(help)),
    "help: no longer claims the app works offline",
    "the SW caches static assets only now, so offline shows the offline page — " +
    "saying otherwise is a promise the product does not keep");
}

/* ===================================================================== */
/* 2. CRON SECRET: AUTHORIZATION HEADER ONLY                             */
/* ===================================================================== */
/*
  `?secret=` put a credential that triggers mass mail and paid model runs
  into request logs, Referer headers and shell history. Vercel Cron sends the
  Bearer header natively, so nothing legitimate needed the query form.
*/
{
  const src = strip(read("src/lib/cron-auth.ts"));
  check(!/searchParams\.get\(\s*["']secret["']\s*\)/.test(src),
    "cron: the ?secret= query fallback is gone",
    "a URL carrying CRON_SECRET ends up everywhere a URL goes");
  check(/headers\.get\(\s*["']authorization["']\s*\)/i.test(src),
    "cron: still reads the Authorization header");
  check(/timingSafeEqual/.test(src), "cron: still compares in constant time");
  check(/secret\.length < 8/.test(src) && /return false/.test(src),
    "cron: still fails closed when CRON_SECRET is unset or trivial");

  /* The runbook must not tell an operator to use the form that now 401s. */
  const deploy = read("DEPLOY-HARDENING.md");
  check(!/api\/cron\/[a-z-]+\?secret=/.test(deploy),
    "docs: DEPLOY-HARDENING no longer shows ?secret= against a cron route",
    "following the runbook would now return 401 and look like an outage");
}

/* ===================================================================== */
/* 3. THE COOKIE NOTICE MUST NOT TAKE A CONSENT IT DID NOT GET           */
/* ===================================================================== */
/*
  The banner said "By continuing you agree to our use of cookies AND TO BE
  CONTACTED ABOUT YOUR INQUIRIES", with one button and no way to refuse.
  Contact permission is not cookie permission, and "by continuing" is not
  consent under the DPDP Act. It also recorded an agreement the user never
  gave, which is the plainest kind of untrue thing to put on a screen.
*/
{
  const src = read("src/components/consent-banner.tsx");
  const visible = strip(src);

  check(!/to be contacted/i.test(visible),
    "banner: does not bundle contact/marketing consent into the cookie notice",
    "permission to email someone belongs on the form where they ask to be contacted");
  check(!/By continuing you agree/i.test(visible),
    "banner: does not claim agreement from mere continuation");
  check(/Got it|Dismiss/i.test(visible),
    "banner: can be dismissed",
    "a notice with no way out is a dark pattern, and these cookies need no consent anyway");

  /* If a tracker is ever added, this notice becomes false — so pin that too. */
  const TRACKERS = /gtag\(|googletagmanager|google-analytics|posthog|plausible\.io|mixpanel\.init|hotjar|fbq\(|@vercel\/analytics/;
  const scanned = ["src/app/layout.tsx", "src/components/consent-banner.tsx"]
    .map((f) => strip(read(f))).join("\n");
  check(!TRACKERS.test(scanned),
    "banner: the 'no third-party tracking' claim is still true in the files that would load one",
    "a tracker was added — the notice and the privacy page now both say something false");

  const privacy = strip(read("src/app/privacy/page.tsx"));
  check(!/control non-essential cookies/i.test(privacy),
    "privacy: does not point users at non-essential cookies that do not exist");
}

/* --------------------------------------------------------------- report */
console.log(`\n${fails.length ? "FAIL" : "PASS"}  device + consent: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
