/**
 * The claims suites were honest. Their GLOBS were the problem.
 *
 * ============================================================================
 * THREE BLIND SPOTS, AND WHAT SURVIVED IN EACH
 * ============================================================================
 *
 * test-claims, test-substantiation, test-positioning and test-capabilities all
 * pass, and all four are good. Every finding below sat outside what they scan.
 *
 *   1. `.ts` DATA AND TEMPLATE MODULES
 *      test-positioning walks src/app and src/components filtered to /\.tsx$/.
 *      So lib/branded-email.ts — the shared shell under EVERY email the
 *      product sends — carried `TAGLINE: "The AI COO for your business"` and
 *      `BADGES: [… "10,000+ Businesses Served"]`. test-claims bans that exact
 *      badge string, calling it "a 200x overstatement of the published
 *      customer count" (the published figure is 50+), and scans ten page files
 *      — not this one. An overstatement in an email is worse than on a page:
 *      it arrives unprompted, addressed to a named person, and is kept.
 *
 *   2. THE `(app)` ROUTE GROUP — the pages customers PAY for
 *      The public /ai-visibility page was corrected to say the feature queries
 *      Gemini, with a long note explaining there is no OpenAI and no Perplexity
 *      call anywhere in it. The signed-in /visibility page still told paying
 *      customers it ran "ChatGPT, Gemini, Perplexity" through "live AI
 *      engines", plus an unsourced "over 100 million people".
 *
 *   3. BINARY FILES
 *      public/investor-onepager.pdf. No suite can read a PDF, so every retired
 *      claim survived in it: a 3-day trial (TRIAL_DAYS is 0), AI COO framing,
 *      "130+ tools, 300+ agents, 25 industries" (128 / 438 / 27), three AI
 *      engines, and a KPI band of AbroBot's student and visa figures under a
 *      Cortex heading — which test-claims exists specifically to prevent. The
 *      file and both links to it are gone.
 *
 * ============================================================================
 * AND ONE CLAIM THAT WAS TRUE UNTIL SOMEONE SIGNED UP
 * ============================================================================
 *
 * "All 28 are free and need no account", with a "Free tools" column in the
 * footer of every public page. paywall.ts had already been given this problem
 * once and allow-listed /calculators — the INDEX. The 28 tools live at their
 * own top-level routes, so all 28 were behind the wall. TRIAL_DAYS and
 * TRIAL_CREDITS are both 0, so every new workspace is locked from its first
 * second: this was not an edge case, it was every single signup, on the one
 * surface the site calls free.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { CALCULATORS } from "../src/lib/nav.ts";
import { PAYWALL_ALLOW, isAllowedWhileLocked } from "../src/lib/paywall.ts";
import { TRIAL_DAYS } from "../src/lib/config.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

/* ========================================================================= */
/* 1. "FREE" MUST SURVIVE SIGNING UP                                         */
/* ========================================================================= */

check(TRIAL_DAYS === 0,
  "TRIAL_DAYS is still 0 — every new workspace is locked immediately",
  "if this ever becomes non-zero the reasoning below changes, but the " +
  "allow-list is still correct");

const blocked = CALCULATORS.filter((c) => !isAllowedWhileLocked(c.href));
check(blocked.length === 0,
  `all ${CALCULATORS.length} calculators are usable by a locked workspace`,
  blocked.length
    ? `${blocked.length} are not: ${blocked.slice(0, 6).map((c) => c.href).join(", ")}… ` +
      `— the index page says they are "free and need no account" and the public ` +
      `footer has a "Free tools" column pointing at them`
    : "");

check(isAllowedWhileLocked("/calculators") && isAllowedWhileLocked("/deadlines"),
  "and so are the two index pages that list them");

/*
  THE ALLOW-LIST MUST NOT DRIFT FROM NAV, IN EITHER DIRECTION.

  paywall.ts lists the 28 paths as literals rather than importing nav.ts,
  because it is imported by a server module and a client component and nav.ts
  pulls in the whole lucide icon set. That is a reasonable trade only if
  something notices when the two disagree.
*/
{
  const navHrefs = new Set(CALCULATORS.map((c) => c.href));
  const allowed = new Set(PAYWALL_ALLOW);
  const missing = [...navHrefs].filter((h) => !allowed.has(h));
  const stale = [...allowed].filter((a) => /^\/(abtest|adbudget|advance-tax|amortization|breakeven|buyvslease|ccc|debt|depreciation|dscr|epf|funnel|gratuity|gst-calc|gst-latefee|inventory-turns|itc|ltv|markup|networth|prepay|rate-card|rentvsbuy|roi|runway|sip|tax|tds)$/.test(a) && !navHrefs.has(a));
  check(missing.length === 0,
    "every calculator in nav is in the paywall allow-list",
    missing.length ? `added to nav but not allow-listed: ${missing.join(", ")}` : "");
  check(stale.length === 0,
    "and the allow-list holds no calculator that nav has dropped",
    stale.length ? `allow-listed but gone from nav: ${stale.join(", ")}` : "");
}

/*
  A SHORT PATH MUST NOT PREFIX-MATCH A BILLABLE ROUTE.

  isAllowedWhileLocked matches by PREFIX (real paths carry query strings and
  sub-routes), and the file already documents one casualty: "/pricing" also
  matches "/pricing-optimizer". Adding 28 short paths like "/tax" and "/roi"
  is exactly how a billable page gets opened for free by accident.
*/
{
  const calcSet = new Set(CALCULATORS.map((c) => c.href));
  const KNOWN_OPEN = new Set(["/dashboard", "/calculators", "/receivables", "/import",
                              "/billing", "/usage", "/settings", "/pricing", "/onboarding", "/deadlines"]);
  const navMod = readFileSync(new URL("src/lib/nav.ts", ROOT), "utf8");
  const allHrefs = [...navMod.matchAll(/href:\s*"(\/[^"]*)"/g)].map((m) => m[1]);
  const leaked = allHrefs.filter((h) => !calcSet.has(h) && !KNOWN_OPEN.has(h) && isAllowedWhileLocked(h));
  check(leaked.length === 0,
    "no billable route is opened by a calculator path prefix-matching it",
    leaked.length ? `now reachable while locked: ${[...new Set(leaked)].join(", ")}` : "");
}

/* ========================================================================= */
/* 2. THE BANNED CLAIMS, APPLIED TO THE FILES THE OTHER SUITES SKIP          */
/* ========================================================================= */

/*
  Deliberately scoped to strings a CUSTOMER can receive — email templates, the
  (app) pages, public data modules. Comments are stripped first: six guards in
  this repo have passed on broken code by matching the explanation beside the
  fix rather than the code.
*/
const BANNED = [
  [/10,?000\+?\s+businesses/i, "a 200x overstatement of the published customer count (50+)"],
  [/\bAI\s+COO\b/i, "positioning retired from the pages; it kept shipping in emails and prompts"],
  [/operating brain/i, "same retired framing"],
  [/\b(3|three)-day trial\b/i, "TRIAL_DAYS is 0 — there is no trial"],
  [/\bfree trial\b/i, "TRIAL_DAYS is 0 — there is no trial"],
  [/ChatGPT|Perplexity/i, "AI Visibility queries Gemini; naming other engines is a claim we cannot keep"],
];

/*
  HISTORY AND PRICING ARE NOT CLAIMS.

  A changelog entry recording what a past release said, a retired plan named
  `AI COO (retired)`, a /terms line listing retired plan names, a pricing
  comment doing unit economics on the old tier, and an article ABOUT the "AI
  COO" category are all legitimate. Rewriting history to satisfy a checker
  would be the dishonest move.
*/
const EXEMPT = [
  "src/lib/changelog.ts",      // a dated record of what shipped
  "src/lib/config.ts",         // retired plan id + pricing-history comments
  "src/lib/pricing-model.ts",  // unit economics on the retired tier
  "src/app/terms/page.tsx",    // "plans previously sold as … have been retired"
  "src/lib/resources.ts",      // an article about the category, not a self-claim
  "src/app/ai-visibility/page.tsx", // explains which engine it uses and why
];

function walk(dir, out = []) {
  for (const e of readdirSync(new URL(dir + "/", ROOT), { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}/${e.name}`, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out;
}

const SCAN = [
  ...walk("src/lib").filter((f) => /email|template|resources|changelog|priorities|branded/.test(f)),
  ...walk("src/app/(app)"),
  ...walk("src/app/api").filter((f) => /email|inquiry|access-request|brief|chat/.test(f)),
  "src/app/opengraph-image.tsx",
  "src/app/login/page.tsx",
  "src/components/public-chrome.tsx",
  "src/components/onboarding-tour.tsx",
  "src/lib/ai/cortex.ts",
  "src/lib/ai/priorities.ts",
];

for (const f of [...new Set(SCAN)]) {
  if (EXEMPT.includes(f)) continue;
  let body;
  try { body = strip(read(f)); } catch { continue; }
  for (const [re, why] of BANNED) {
    const m = body.match(re);
    check(!m, `${f.replace("src/", "")} carries no banned claim`,
      m ? `"${m[0]}" — ${why}` : "");
  }
}

/* ========================================================================= */
/* 3. THE CONTACT DETAILS MUST AGREE WITH EACH OTHER                         */
/* ========================================================================= */

{
  const emailPhone = (read("src/lib/branded-email.ts").match(/PHONE:\s*"([^"]+)"/) || [])[1] || "";
  const pagePhone = (read("src/components/public-chrome.tsx").match(/\+91\s*\d{5}\s*\d{5}/) || [])[0] || "";
  const digits = (s) => s.replace(/\D/g, "");
  check(digits(emailPhone) === digits(pagePhone) && digits(emailPhone).length >= 10,
    "the phone number in emails matches the one on the website",
    `email says ${emailPhone || "nothing"}, the public footer says ${pagePhone || "nothing"} — ` +
    "a customer replying to one and ringing the other reached two different numbers");

  const wa = (read("src/lib/config.ts").match(/WHATSAPP_NUMBER[^"]*"(\d+)"/) || [])[1] || "";
  check(wa.endsWith(digits(pagePhone)),
    "and the WhatsApp default matches the published number",
    `WHATSAPP_NUMBER is ${wa}; the footer publishes ${digits(pagePhone)}`);
}

/* ========================================================================= */
/* 4. ONE DURATION FOR THE HEALTH CHECK                                      */
/* ========================================================================= */

{
  const landing = read("src/app/page.tsx");
  const hc = read("src/app/health-check/page.tsx");
  check(!/60[- ]second/i.test(landing) && !/Free · 60 seconds/i.test(landing),
    "the landing page no longer promises a 60-second health check",
    "the check's own page says \"about two minutes\" — one click apart and 2x off");
  check(/two minutes|2 minutes|2-minute/i.test(hc + landing),
    "and the duration quoted is the one the page itself states");
}

/* ========================================================================= */
/* 5. NO BINARY MAY CARRY CLAIMS NOTHING CAN READ                            */
/* ========================================================================= */

{
  check(!existsSync(new URL("public/investor-onepager.pdf", ROOT)),
    "the unreadable investor PDF is gone",
    "no suite in this repo can read a PDF, which is how a 3-day trial, AI COO " +
    "framing, three wrong counts, three AI engines and AbroBot's KPI band all " +
    "survived inside one");

  const inv = read("src/app/investors/page.tsx");
  check(!/investor-onepager\.pdf/.test(inv), "and nothing links to it");

  /* The rule, not just the instance: no claims-bearing binary in public/. */
  const bins = readdirSync(new URL("public/", ROOT))
    .filter((f) => /\.(pdf|docx|pptx|xlsx)$/i.test(f))
    .filter((f) => statSync(new URL(`public/${f}`, ROOT)).isFile());
  check(bins.length === 0,
    "public/ serves no document the claims suites cannot read",
    bins.length ? `found: ${bins.join(", ")} — either delete it or generate it from the ` +
                  `same constants the pages render` : "");
}

console.log(`\nclaims blind spots: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  ${CALCULATORS.length} free tools are actually free; emails, the (app) pages and public/ carry no retired claim.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
