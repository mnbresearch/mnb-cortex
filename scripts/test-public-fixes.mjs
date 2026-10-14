/**
 * Public-surface fixes from the October audit, held to the code.
 *
 *   P0-1  Signing up from /pricing or /features reaches checkout.
 *         Pricing sent anonymous visitors to /login?next=/billing, login
 *         ignored `next` entirely (hard-coded /dashboard), and the magic-link /
 *         Google / email-confirmation redirects dropped it — so nobody who had
 *         just picked a plan ever reached /billing.
 *   P0-2  The privacy policy names AI Visibility's answer engines. It said
 *         Groq/Anthropic/OpenAI were "used only as fallbacks", while AI
 *         Visibility uses OpenAI's Responses API with web search as a second
 *         engine and Groq as primary when there is no Gemini key.
 *   P0-3  Export claims say what the export is: every workspace table, as JSON.
 *         Not "export everything", not "entire workspace", and no format that
 *         does not exist.
 *
 * Plus cheap guards on a few P1s that are easy to reintroduce.
 *
 * Run: node --experimental-strip-types --no-warnings scripts/test-public-fixes.mjs
 */
import { readFileSync } from "node:fs";
import { safeNext } from "../src/app/login/safe-next.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

/* ===================================================== P0-1: next survives */

/* The sanitiser: same-origin relative paths only. */
for (const ok of ["/billing", "/usage", "/receivables?tab=overdue", "/dashboard#x"]) {
  check(safeNext(ok) === ok, `safeNext accepts ${ok}`);
}
for (const bad of [null, undefined, "", "billing", "https://evil.com", "//evil.com", "/\\evil.com", "/\\/evil.com",
  "javascript:alert(1)", "/login", "/login?next=/billing", "/auth/callback", "/ok\u0000", "/a\nb", "/" + "a".repeat(600)]) {
  check(safeNext(bad) === null, `safeNext rejects ${JSON.stringify(bad)?.slice(0, 40)}`);
}

/* Pricing sends a new visitor to "Create account" and on to checkout. */
const pricing = strip(read("src/components/pricing-client.tsx"));
check(/\/login\?mode=signup&next=\$\{encodeURIComponent\("\/billing"\)\}/.test(pricing),
  "pricing: plan button → /login?mode=signup&next=/billing",
  "without mode=signup a new visitor lands on a sign-in form; without next they never reach checkout");
check(/\/login\?mode=signup&next=\$\{encodeURIComponent\("\/usage"\)\}/.test(pricing),
  "pricing: credit packs → /login?mode=signup&next=/usage");
check(!/\/login\?next=/.test(pricing), "pricing: no /login?next= link without mode=signup");

const atlas = strip(read("src/components/feature-atlas.tsx"));
check(/\/login\?mode=signup&next=\$\{encodeURIComponent\(f\.route\)\}/.test(atlas), "feature atlas (public): cards carry mode=signup and next");

/* Login reads, sanitises and USES next on every route in. */
const login = strip(read("src/app/login/page.tsx"));
check(/safeNext\(\s*u\.searchParams\.get\("next"\)\s*\)/.test(login), "login: reads ?next through safeNext");
check(!/let next = "\/dashboard"/.test(login), "login: next is no longer hard-coded to /dashboard");
check(/if \(next\) dest = next;/.test(login) && /window\.location\.href = dest;/.test(login),
  "login: password sign-in/up (and one-tap) lands on next after the workspace exists");
check(/\/auth\/callback\$\{next \? `\?next=\$\{encodeURIComponent\(next\)\}` : ""\}/.test(login),
  "login: the callback URL carries ?next=");
check((login.match(/(?:emailRedirectTo|redirectTo): callbackUrl\(\)/g) || []).length === 3,
  "login: sign-up confirmation, magic link and Google redirect all use callbackUrl()",
  `found ${(login.match(/(?:emailRedirectTo|redirectTo): callbackUrl\(\)/g) || []).length} of 3`);
check(!/\/auth\/callback`/.test(login.replace(/function callbackUrl[\s\S]*?\n  \}/, "")),
  "login: no bare /auth/callback redirect left outside callbackUrl()");

/* The callback honours the same sanitiser. */
const cb = strip(read("src/app/auth/callback/route.ts"));
check(/safeNext\(searchParams\.get\("next"\)\)/.test(cb), "auth/callback: ?next goes through safeNext");
check(/res\.created && !wanted/.test(cb), "auth/callback: a new workspace with a destination goes there, not to onboarding");

/* P1-9 rides along: delete-workspace → /login?deleted=1 is acknowledged. */
check(/u\.searchParams\.get\("deleted"\) === "1"/.test(login) && /Workspace deleted\./.test(login), "login: ?deleted=1 shows 'Workspace deleted.'");

/* ============================================ P0-2: AI Visibility providers */

const privacy = strip(read("src/app/privacy/page.tsx"));
check(!/used only as fallbacks/i.test(privacy), "privacy: no longer says Groq/Anthropic/OpenAI are used only as fallbacks");
check(/AI Visibility/.test(privacy) && /OpenAI&rsquo;s Responses API with web\s+search/.test(privacy),
  "privacy: names OpenAI's Responses API with web search for AI Visibility");
check(/Groq answers them instead/.test(privacy), "privacy: says Groq answers when neither grounded engine is available");
/* …and the code still matches what the policy says. */
const vis = read("src/lib/ai/visibility.ts");
check(/api\.openai\.com\/v1\/responses/.test(vis) && /type: "web_search"/.test(vis), "visibility.ts: OpenAI Responses API with web_search (as the policy states)");

/* ======================================================= P0-3: export copy */

const landing = strip(read("src/app/page.tsx"));
const features = strip(read("src/app/features/page.tsx"));
const changelog = read("src/lib/changelog.ts");
for (const [f, src] of [["page.tsx", landing], ["features/page.tsx", features], ["privacy/page.tsx", privacy]]) {
  check(!/Export everything/i.test(src), `${f}: no "Export everything"`);
  check(!/entire workspace/i.test(src), `${f}: no "entire workspace"`);
}
check(/export every table in your workspace as JSON/i.test(landing), "landing: export claim is 'every table … as JSON'");
check(/every table in your workspace as JSON/i.test(features), "features: export claim is 'every table … as JSON'");
check(!/workspace memory and data \(JSON \/ Markdown\)/.test(privacy), "privacy: workspace data is not claimed as Markdown");
check(/every table in your workspace as JSON/.test(privacy), "privacy: workspace export described as JSON of every table");
check(!/"Exports, customer pages and the MIS pack now read every row/.test(changelog), "changelog: export entry rewritten to what the export does");
/* The export itself is JSON — the claim stays true only while it is. */
check(/"Content-Type": "application\/json"/.test(read("src/app/api/export/route.ts")), "api/export still returns JSON");

/* ========================================================= cheap P1 guards */

check(!/Most popular/.test(pricing), "pricing: no 'Most popular' badge (no customers to be popular with)");
check(/Recommended/.test(pricing), "pricing: the highlighted plan is labelled 'Recommended'");

const config = read("src/lib/config.ts");
const iw = config.slice(config.indexOf("export const IMAGE_WEEKLY"));
const vw = config.slice(config.indexOf("export const VIDEO_WEEKLY"));
check(/\bpayg: 0,/.test(iw.slice(0, iw.indexOf("};"))), "IMAGE_WEEKLY.payg is 0 — a credit pack does not unlock images");
check(/\bpayg: 0,/.test(vw.slice(0, vw.indexOf("};"))), "VIDEO_WEEKLY.payg is 0 — a credit pack does not unlock video");

const help = strip(read("src/app/help/page.tsx"));
check(!/Privacy Policy — MNB Cortex/.test(help) && /title: "Help — MNB Cortex"/.test(help), "/help is a help page, not a copy of the privacy policy");
check(/href="\/contact"/.test(strip(read("src/components/trial-guard.tsx"))) && !/href="\/help"[^>]*>Talk to us/.test(read("src/components/trial-guard.tsx")),
  "trial guard: 'Talk to us' goes to /contact");
check(/href="\/contact"[^>]*>contact our team/.test(read("src/components/byo-key-card.tsx")), "BYO card: 'contact our team' goes to /contact");

const og = strip(read("src/app/opengraph-image.tsx"));
check(!/brain of its own|reads everything|remembers everything/i.test(og), "OG image: retired overclaim gone");

for (const [f, src] of [["compare", strip(read("src/app/compare/page.tsx"))], ["features", features]]) {
  check(!/"Reads all your business data", (?:v: \[)?"y"/.test(src), `${f}: Cortex is not given full marks for reading all business data`);
}

const actPage = strip(read("src/app/(app)/act/page.tsx")) + strip(read("src/components/act-center.tsx"));
check(!/from your own domain|from your verified domain/i.test(actPage), "act: no 'from your own domain' — mail leaves on MNB Cortex's address");

/* --------------------------------------------------------------- report */
console.log(`public fixes: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log("  FAIL " + f);
process.exit(failures.length ? 1 : 0);
