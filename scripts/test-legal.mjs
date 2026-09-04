/**
 * The legal pages, checked against what the product actually does.
 *
 * WHY THIS IS A TEST AND NOT A REVIEW.
 *
 * /terms is linked from the checkout. A customer clicking "pay" is agreeing to
 * that page, so when it lists plans and credit allowances, those are contract
 * terms — and they were WRONG: it named four retired tiers with allowances that
 * had never been correct (1,000 / 5,000 / 20,000 against real values of
 * 1,350 / 4,600 / 13,850). Nobody notices, because nobody re-reads the Terms
 * when they change a price in config.ts. So the two are pinned together here.
 *
 * The second half covers the material change collections introduced: Cortex now
 * holds contact details for people who never signed up, and messages them. A
 * privacy policy silent on that is not a small omission — it is the first thing
 * a careful buyer or their CA will ask about, and the answer has to already be
 * written down.
 */

import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

const CONFIG = readFileSync("src/lib/config.ts", "utf8");
const TERMS = readFileSync("src/app/terms/page.tsx", "utf8");
const PRIVACY = readFileSync("src/app/privacy/page.tsx", "utf8");
const REFUND = readFileSync("src/app/refund/page.tsx", "utf8");

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CONFIG_CODE = strip(CONFIG);

/* ------------------------------------- the Terms must match config.ts */

const plans = [...CONFIG_CODE.matchAll(/\{ id: "([a-z]+)", name: "([^"]+)", monthly: (\d+), annual: (\d+)/g)]
  .map((m) => ({ id: m[1], name: m[2], monthly: Number(m[3]), annual: Number(m[4]) }));
check(plans.length >= 5, "parse: read the plans from config", `${plans.length}`);

const creditsBlock = CONFIG_CODE.match(/export const PLAN_CREDITS[^=]*=\s*\{([\s\S]*?)\n\};/);
const credits = {};
if (creditsBlock) for (const kv of creditsBlock[1].matchAll(/([a-z_]+)\s*:\s*(-?\d+)/g)) credits[kv[1]] = Number(kv[2]);
check(Object.keys(credits).length >= 8, "parse: read the credit allowances");

const LIVE = ["watch", "watchpro", "practice", "command"];
const inr = (n) => n.toLocaleString("en-IN");

for (const p of plans.filter((x) => LIVE.includes(x.id))) {
  check(TERMS.includes(p.name),
    `Terms names the "${p.name}" plan`,
    "a plan a customer can buy is not described in the contract they agree to");
  check(TERMS.includes(`₹${inr(p.monthly)}/month`),
    `Terms states ${p.name}'s monthly price correctly`,
    `expected ₹${inr(p.monthly)}/month`);
  check(TERMS.includes(`₹${inr(p.annual)}/year`),
    `Terms states ${p.name}'s annual price correctly`,
    `expected ₹${inr(p.annual)}/year`);
  const c = credits[p.id];
  check(c !== undefined && TERMS.includes(`${inr(c)} AI credits`),
    `Terms states ${p.name}'s credit allowance correctly`,
    `expected ${inr(c)} AI credits — a wrong number here is a term we do not honour`);
}

/* Retired tiers must not be offered in the contract. */
for (const [name, price] of [["Starter", "₹1,499"], ["Growth", "₹4,999/month or ₹49,990/year · 4,600"]]) {
  check(!new RegExp(`<strong>${name}</strong>`).test(TERMS),
    `Terms no longer lists "${name}" as a purchasable plan`,
    "a retired tier presented as available is an offer we cannot fulfil");
}
check(/retired/i.test(TERMS),
  "Terms explains that retired plans keep what they bought",
  "existing customers need to know their price and allowance are safe");

/* ------------------------------------- outbound messaging is documented */

check(/Messages Cortex Sends On Your Behalf/i.test(TERMS),
  "Terms has a section on messaging the customer's customers",
  "the product now contacts third parties; the contract must say on whose authority");

for (const [phrase, why] of [
  ["switched off by default", "the default state must be stated"],
  ["approve", "approval is the core safeguard and must be a term, not just a UI choice"],
  ["do-not-contact", "the customer's controls belong in the contract"],
  ["never threaten legal action", "what Cortex will NOT write is the promise that matters most"],
  ["responsible", "the customer, not us, is the sender and must be told so"],
]) {
  check(new RegExp(phrase, "i").test(TERMS), `Terms states: ${phrase}`, why);
}

/* ------------------------------- third-party data is covered in Privacy */

check(/Data About Your Customers And Suppliers/i.test(PRIVACY),
  "Privacy has a section on data about people who are not our users",
  "collections stores their names, emails and phone numbers — silence here is the omission a buyer's CA will find");

for (const [phrase, why] of [
  ["controller", "the customer is the controller and we are the processor; that split has to be explicit"],
  ["processor", "same"],
  ["lawful basis", "whose responsibility it is to have one"],
  ["do not sell", "the plainest thing a worried reader is looking for"],
  ["between workspaces", "one tenant's parties must never reach another, and we should say so"],
  ["delete", "there must be a route to erase a specific individual"],
]) {
  check(new RegExp(phrase, "i").test(PRIVACY), `Privacy states: ${phrase}`, why);
}

/* --------------------------------------------- no contradictions left */

/*
  The refund page contradicted itself two sentences apart — "we do not offer a
  free trial" followed by "when the trial ends". Trial language is gone from the
  product, so any claim that one exists is a contradiction with both the Terms
  and the code.
*/
const TRIAL_CLAIMS = [/start(ing)? a (free )?trial/i, /when the trial ends/i, /\b\d+-day (free )?trial/i];
for (const re of TRIAL_CLAIMS) {
  check(!re.test(REFUND), `Refund page makes no claim matching ${re}`,
    "TRIAL_DAYS is 0; describing a trial contradicts the Terms and the product");
  check(!re.test(TERMS), `Terms makes no claim matching ${re}`);
}
check(/do not currently offer a free trial/i.test(TERMS), "Terms says plainly that there is no trial");

/* Section numbering must be sequential — a duplicated number in a contract is
   the kind of sloppiness that makes a buyer doubt the rest of it. */
for (const [label, src] of [["Terms", TERMS], ["Privacy", PRIVACY]]) {
  const nums = [...src.matchAll(/<H2>(\d+)\./g)].map((m) => Number(m[1]));
  check(nums.length > 5, `parse: found ${label} sections`, `${nums.length}`);
  const sequential = nums.every((n, i) => n === i + 1);
  check(sequential, `${label} sections are numbered 1..n with no repeats or gaps`,
    `got ${nums.join(", ")}`);
}

console.log(`\nlegal: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Terms match config.ts exactly; outbound messaging and third-party data are documented.");
