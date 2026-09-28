/**
 * A visitor must be able to see BOTH doors, and each must open the right one.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * /login has had a signin/signup toggle since it was written, and the toggle
 * was reachable only by clicking it — the page never read a URL parameter, so
 * nothing on the site could link to "Create account".
 *
 * Every call to action on the marketing site therefore sent a FIRST-TIME
 * VISITOR to a form asking for a password they had never set: the hero's
 * "Start with one file", the header's "Get started", the footer's "Get
 * started", and the same button on /features, /pricing, /industries,
 * /compare, /deadlines and /ai-visibility. The only route to an account was
 * to notice a small pill at the top of a page that looked like it was asking
 * you to log in.
 *
 * And the reverse: "Sign in" in the header was `hidden sm:inline`, so it
 * vanished below 640px, and the mobile menu offered only "Get started". An
 * existing customer on a phone had no sign-in link anywhere on the site.
 *
 * ============================================================================
 * WHAT THIS PINS
 * ============================================================================
 *
 * That both entrances exist, that neither is hidden behind a breakpoint, and
 * that a link's DESTINATION matches its LABEL. The last one is the rule that
 * actually matters: a button saying "Create your workspace" that opens a
 * sign-in form is not a styling problem, it is the product saying one thing
 * and doing another.
 */

import { readFileSync, readdirSync } from "node:fs";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/* ======================================================================== */
/* 1. THE SIGNUP FORM IS LINKABLE AT ALL                                    */
/* ======================================================================== */

const login = strip(src("src/app/login/page.tsx"));
check(/searchParams\.get\("mode"\)/.test(login),
  "/login reads ?mode from the URL",
  "Without this no link anywhere can open the Create account tab, and every " +
  "'Get started' on the site lands a new visitor on a sign-in form.");

/*
  SCOPED TO THE EFFECT THAT READS THE URL.

  My first version searched the whole file for `=== "signup"` near a
  `setMode("signup")`. Deleting the line that acts on the parameter still
  passed, because the signin/signup toggle further down the page contains both
  tokens close together. Same mistake as the ledger and tenancy guards earlier
  in this work: a match anywhere in a file is not evidence about one function.
*/
const modeEffect = (login.match(/useEffect\(\(\) => \{[^]*?searchParams\.get\("mode"\)[^]*?\}, \[\]\);/) || [""])[0];
check(modeEffect.length > 60, "found the effect that reads ?mode", `saw ${modeEffect.length} chars`);
check(/setMode\("signup"\)/.test(modeEffect),
  "…and that effect actually switches to the signup tab",
  "Reading the parameter and ignoring it leaves the signup form unreachable.");
check(/useState<Mode>\("signin"\)/.test(login),
  "…while the default stays sign in",
  "An unrecognised value must fall back to the safe default, not throw.");

/* ======================================================================== */
/* 2. BOTH DOORS ARE IN THE HEADER, AT EVERY WIDTH                          */
/* ======================================================================== */

const chrome = src("src/components/public-chrome.tsx");
const header = chrome.slice(chrome.indexOf("export function PublicHeader"), chrome.indexOf("export function PublicFooter"));
const headerCode = strip(header);

check(/>\s*Sign in\s*</.test(headerCode), "the header has a Sign in control");
check(/Create account|Sign up/.test(headerCode), "the header has a sign-up control");

/*
  The sign-in link must not be hidden at a breakpoint. `hidden sm:inline` is
  what made it disappear on a phone, and the phone is where most of this
  product's visitors are.
*/
const signInTag = (headerCode.match(/<Link[^>]*>\s*Sign in\s*</) || [""])[0];
check(signInTag.length > 0, "found the header's Sign in link");
check(!/\bhidden\b/.test(signInTag),
  "the header's Sign in link is NOT hidden at any breakpoint",
  "It was `hidden sm:inline`, so below 640px it did not exist — and the " +
  "mobile menu had no sign-in either.");

/* The mobile menu needs both, since the header's filled button is hidden
   there on the smallest screens. */
const menu = chrome.slice(chrome.indexOf('aria-label="Menu"'));
const menuCode = strip(menu);
check(/Sign in/.test(menuCode), "the mobile menu offers Sign in");
check(/mode=signup/.test(menuCode), "the mobile menu offers a signup link");

/* ======================================================================== */
/* 3. A LINK'S DESTINATION MATCHES ITS LABEL                                */
/* ======================================================================== */

/*
  Scanned across the whole public surface, because this defect was never in
  one file: eight marketing pages each had their own "Get started" pointing at
  the sign-in tab.

  AND ACROSS src/components, WHICH THE FIRST VERSION OF THIS TEST MISSED.

  It scanned page.tsx files plus public-chrome.tsx, so it passed — and the
  live site still had two CTAs going to the wrong form: "Get started for
  Manufacturing" in the industry picker, and "Fix my AI visibility" in the
  visibility check. Both are components rendered BY those pages, so a scan of
  the pages alone could never see them. Found by reading the deployed HTML,
  not by the suite that was supposed to make reading it unnecessary.

  The whole components directory is scanned now. In-app components are safe to
  include because the rule is about label-vs-destination, and an in-app
  "Sign in" prompt pointing at /login is exactly right.
*/
function walk(dir) {
  const out = [];
  for (const e of readdirSync(new URL("../" + dir + "/", import.meta.url), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(`${dir}/${e.name}`));
    else if (e.name === "page.tsx") out.push(`${dir}/${e.name}`);
  }
  return out;
}
/* The signed-in app is excluded: a "Sign in" prompt on a gated page is
   correct, and those pages have no signup CTA to get wrong. */
const publicPages = walk("src/app").filter((p) => !p.includes("/(app)/"));
check(publicPages.length > 10, "found the public pages", `${publicPages.length}`);

const componentFiles = readdirSync(new URL("../src/components/", import.meta.url), { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
  .map((e) => `src/components/${e.name}`);
check(componentFiles.length > 50, "found the components", `${componentFiles.length}`);

const SIGNUP_LABEL = /(get started|create (your )?(account|workspace)|start with one file|get warned before each one|fix my ai visibility)/i;
const SIGNIN_LABEL = /^\s*sign in/i;

const mismatched = [];
for (const p of [...publicPages, ...componentFiles]) {
  const body = strip(src(p));
  for (const m of body.matchAll(/href="(\/login[^"]*)"/g)) {
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 400);
    const label = after.split("</Link>")[0].split("</a>")[0].replace(/<[^>]*>/g, " ").replace(/\{[^}]*\}/g, " ").trim();
    if (!label) continue;
    const isSignup = SIGNUP_LABEL.test(label);
    const goesToSignup = m[1].includes("mode=signup");
    if (isSignup && !goesToSignup) {
      mismatched.push(`${p}: "${label.slice(0, 40)}" → ${m[1]} (should open signup)`);
    }
    if (SIGNIN_LABEL.test(label) && goesToSignup) {
      mismatched.push(`${p}: "${label.slice(0, 40)}" → ${m[1]} (should open sign in)`);
    }
  }
}
check(mismatched.length === 0,
  "every auth link opens the form its label promises",
  mismatched.length
    ? mismatched.join("\n      ") +
      "\n      A button saying 'Create your workspace' that opens a sign-in " +
      "\n      form asks a new visitor for a password they never set."
    : "");

/* ======================================================================== */
/* 4. THE LANDING PAGE CARRIES BOTH IN ITS OWN BODY                         */
/* ======================================================================== */

/*
  Not only in the header. The header is fixed with no background until you
  scroll 24px, so at rest both controls sit as small text over the hero — which
  is why this was reported as "not visible anywhere on the landing page".
*/
const landing = strip(src("src/app/page.tsx"));
check(/mode=signup/.test(landing), "the landing page body links to signup");
check(/Already have an account|Already a customer/.test(landing),
  "the landing page body offers a sign-in route too",
  "A returning customer should not have to hunt the header for the way back in.");
check((landing.match(/href="\/login/g) || []).length >= 4,
  "the landing page has several auth entry points",
  `saw ${(landing.match(/href="\/login/g) || []).length}`);

/* ======================================================================== */
/* 5. THE WORDING STAYS OUT OF TROUBLE                                      */
/* ======================================================================== */

/*
  public-chrome.tsx carries a note explaining why the CTA must not say "Start
  free": TRIAL_DAYS and TRIAL_CREDITS are both 0, so a visitor who signed up on
  that promise could not run anything — the misleading-advertisement pattern
  the Consumer Protection Act 2019 is aimed at, and one /refund and /terms
  already contradict. Creating an account IS free; using it is not.
*/
for (const [p, body] of [["public-chrome", headerCode + menuCode], ["landing", landing]]) {
  check(!/Start free|Free trial|free trial/i.test(body),
    `${p}: no "start free" or "free trial" promise on an auth CTA`,
    "Both trial constants are 0. The genuinely free thing is the health check.");
}

/* ======================================================================== */

console.log(`\nauth entry points: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
