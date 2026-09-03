/**
 * The repositioning, locked down.
 *
 * Two classes of thing are asserted here, and they fail in different ways.
 *
 * 1. POSITIONING. "AI COO" is a category nobody searches for, describes a role
 *    the buyer already occupies, and is unfalsifiable — the largest remaining
 *    overclaim in a product we spent weeks making honest. It is easy to
 *    reintroduce by accident, one component at a time, because it reads as
 *    ambitious. So the customer-facing copy is checked.
 *
 * 2. PLAN RESOLUTION, which is where the money is. Retired tiers were kept, at
 *    the economics they were sold at, so an existing workspace still resolves to
 *    a real allowance. The failure mode is subtle and expensive: repricing a
 *    retired id in place would hand a ₹1,499 customer the credit allowance of a
 *    ₹4,999 one — a margin hole created by a marketing change, invisible until
 *    the bill arrives. Every live and retired id must therefore appear in every
 *    record keyed by plan.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

const CONFIG = readFileSync("src/lib/config.ts", "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CONFIG_CODE = strip(CONFIG);

/* ------------------------------------------------------------ plan tables */

function table(name) {
  /*
    Built with RegExp rather than a literal because the table name varies. Note
    the escaping: inside a template literal `\\s` produces `\s` in the string,
    which is what RegExp needs. The first version used `\\\\s`, which produces a
    LITERAL backslash followed by "s" — so it matched nothing, every table
    parsed as empty, and the coverage checks below reported that half the plan
    ids were missing when they were all present.
  */
  const m = CONFIG_CODE.match(new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!m) return null;
  const out = {};
  for (const kv of m[1].matchAll(/([a-z_]+)\s*:\s*(-?\d+)/g)) out[kv[1]] = Number(kv[2]);
  return out;
}

const credits = table("PLAN_CREDITS");
const seats = table("PLAN_SEATS");
const images = table("IMAGE_WEEKLY");
const videos = table("VIDEO_WEEKLY");

check(credits && Object.keys(credits).length >= 8, "parse: read PLAN_CREDITS",
  `got ${credits ? Object.keys(credits).length : 0} keys — the checks below would be vacuous`);
check(seats && Object.keys(seats).length >= 8, "parse: read PLAN_SEATS");
check(images && Object.keys(images).length >= 8, "parse: read IMAGE_WEEKLY");
check(videos && Object.keys(videos).length >= 8, "parse: read VIDEO_WEEKLY");

const LIVE = ["watch", "watchpro", "practice", "command", "enterprise"];
const RETIRED = ["starter", "growth", "business", "aicoo"];

/*
  Every id the system can encounter must resolve in every table. A missing key
  silently falls through to a default, and the defaults are not conservative —
  seatLimit() falls back to `starter`, which would give a Practice firm ONE seat.
*/
for (const id of [...LIVE, ...RETIRED]) {
  check(credits?.[id] !== undefined, `PLAN_CREDITS covers "${id}"`, "would fall through to a default");
  check(seats?.[id] !== undefined, `PLAN_SEATS covers "${id}"`);
  check(images?.[id] !== undefined, `IMAGE_WEEKLY covers "${id}"`);
  check(videos?.[id] !== undefined, `VIDEO_WEEKLY covers "${id}"`);
}

/* --------------------------------------------------- the premium floor */

const plans = [...CONFIG_CODE.matchAll(/\{ id: "([a-z]+)", name: "([^"]+)", monthly: (\d+), annual: (\d+)/g)]
  .map((m) => ({ id: m[1], name: m[2], monthly: Number(m[3]), annual: Number(m[4]) }));

check(plans.length >= 5, "parse: read the PLANS ladder", `${plans.length} found`);

const live = plans.filter((p) => LIVE.includes(p.id) && p.monthly > 0);
check(live.length >= 4, "there are at least four purchasable tiers", `${live.length}`);

const FLOOR = 4999;
for (const p of live) {
  check(p.monthly >= FLOOR, `"${p.id}" is at or above the ₹${FLOOR} floor`,
    `₹${p.monthly} — the point of repricing was to stop competing on price with Zoho at ₹899`);
}

/*
  No live tier may sell a credit below ₹0.90, the floor every action in
  CREDIT_COSTS is priced against. Worst case is the ANNUAL price per month.
*/
for (const p of live) {
  const allowance = credits?.[p.id];
  if (!allowance || allowance < 0) continue;   // enterprise is negotiated by hand
  const perCredit = (p.annual / 12) / allowance;
  check(perCredit >= 0.90, `"${p.id}" does not sell credits under ₹0.90`,
    `₹${perCredit.toFixed(3)} per credit at the annual rate`);
}

/* The retired tiers must keep the economics they were SOLD at. */
check(credits?.starter === 1350, "retired 'starter' keeps its original 1,350 allowance",
  `got ${credits?.starter} — repricing a retired id hands old customers a bigger allowance than they paid for`);
check(credits?.growth === 4600, "retired 'growth' keeps its original allowance");
check(seats?.starter === 1, "retired 'starter' keeps its single seat");

/* A brand-new workspace must start on a LIVE tier. */
const ws = readFileSync("src/lib/workspace.ts", "utf8");
const signupPlan = ws.match(/plan:\s*"([a-z]+)"/)?.[1];
check(LIVE.includes(signupPlan || ""), "a new workspace is created on a LIVE tier",
  `signup creates plan "${signupPlan}", which is retired — its allowance reflects a price nobody can buy`);

/* The paywall must offer plans that can actually be purchased. */
const guard = readFileSync("src/components/trial-guard.tsx", "utf8");
const offered = [...guard.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).filter((x) => [...LIVE, ...RETIRED].includes(x));
check(offered.length > 0 && offered.every((p) => LIVE.includes(p)),
  "the paywall offers only purchasable tiers",
  `offers ${JSON.stringify(offered)} — a locked-out customer would be shown a plan they cannot buy`);

/* ------------------------------------------------------------ positioning */

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e)) out.push(p);
  }
  return out;
}

/*
  Comments are stripped first. Several files legitimately EXPLAIN why the
  AI COO framing was retired, and a check that flags its own documentation is a
  check people switch off — the same mistake made twice already in this repo.
*/
const offenders = [];
for (const f of walk("src/app").concat(walk("src/components"))) {
  const code = strip(readFileSync(f, "utf8"));
  if (/AI\s+(COO|CEO)\b/.test(code)) offenders.push(f.replace("src/", ""));
}
check(offenders.length === 0, "no customer-facing copy says 'AI COO' or 'AI CEO'",
  `still present in: ${offenders.join(", ")}`);

const home = readFileSync("src/app/page.tsx", "utf8");
check(/what happened/.test(home) && /about to/.test(home),
  "the hero states the early-warning position");
check(/Tally/.test(home) && /accounting software/i.test(home),
  "the hero says Cortex sits ON TOP of existing books rather than replacing them",
  "the 'keep your accounting software' promise is what makes adoption cheap");

const layout = readFileSync("src/app/layout.tsx", "utf8");
check(!/operating brain/i.test(layout), "page metadata no longer says 'operating brain'");
check(/early-warning/i.test(layout), "page metadata carries the new position");

console.log(`\npositioning: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`  ${live.length} live tiers, floor ₹${FLOOR}; ${RETIRED.length} retired tiers still resolve.`);
