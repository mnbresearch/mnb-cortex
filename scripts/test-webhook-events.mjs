/**
 * Every advertised webhook event must have something that emits it.
 *
 * WHY THIS IS A TEST AND NOT A REVIEW.
 *
 * WEBHOOK_EVENTS is rendered directly as the checkbox list on /developers, so
 * adding a string to that array is the same act as selling the event. Three of
 * the seven had no emitter anywhere in the codebase:
 *
 *   alert.created         — the galling one. Alerts ARE inserted, in three
 *                           different places, and none of them emitted.
 *   invoice.overdue       — nothing anywhere.
 *   subscription.expired  — nothing anywhere.
 *
 * A customer subscribes, builds something against it, and waits forever. There
 * is no error, no empty state, nothing in a log — the integration is simply
 * inert, and the only way to discover that is to read our source. That is worse
 * than a feature being missing, because the customer has spent their own time
 * on it.
 *
 * `subscription.expired` was REMOVED rather than wired: lapse is evaluated
 * lazily by entitlement.ts whenever access is checked, so there is no moment
 * when it "happens" and nothing honest to hang the event on. Inventing a cron
 * purely to make a checkbox true would be building the wrong thing.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}\n      ${d}`));

const root = resolve(import.meta.dirname, "..");

/** Every .ts/.tsx under src, so an emitter cannot hide in a file we forgot. */
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const FILES = walk(join(root, "src"));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* Read the advertised list from the shipping source. */
const WH = readFileSync(join(root, "src/lib/webhooks.ts"), "utf8");
const block = WH.match(/export const WEBHOOK_EVENTS = \[([\s\S]*?)\] as const;/);
check(!!block, "parse: found WEBHOOK_EVENTS");
const events = block ? [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
check(events.length >= 4, "parse: read the event list", `${events.length}`);

/*
  Collect every event NAME that is actually emitted. Comments are stripped
  first — this whole area is heavily commented and several of those comments
  name the very events that were missing, so searching raw source would find
  the explanation and call it an emitter.
*/
const emitted = new Set();
for (const f of FILES) {
  if (f.endsWith("webhooks.ts")) continue;   // the definition, not an emitter
  const code = strip(readFileSync(f, "utf8"));
  for (const m of code.matchAll(/emit(?:Quietly|Event)\s*\(\s*[^,]+,\s*"([^"]+)"/g)) {
    emitted.add(m[1]);
  }
}
check(emitted.size >= 3, "parse: found emit call sites", [...emitted].join(", "));

/* ------------------------------------------------- the property that matters */

for (const e of events) {
  check(emitted.has(e), `"${e}" is emitted by something`,
    `it is selectable on /developers and fired by nothing — a customer can subscribe and wait forever`);
}

/* And the converse: emitting an event nobody can subscribe to is dead code. */
for (const e of emitted) {
  check(events.includes(e), `emitted event "${e}" is in WEBHOOK_EVENTS`,
    "an event no customer can select is delivered to nobody");
}

/* --------------------------------------------------------- non-vacuity */

/*
  If this test cannot tell an emitted event from an unemitted one, it proves
  nothing. Check a name that is deliberately absent.
*/
check(!emitted.has("subscription.expired"),
  "subscription.expired really has no emitter",
  "if something now emits it, add it back to WEBHOOK_EVENTS — the point is that the two agree");
check(!events.includes("subscription.expired"),
  "…and it is no longer advertised");

/* The two that were fixed, pinned to WHERE they fire, so a refactor that drops
   the call is caught with a useful message rather than a bare list mismatch. */
const METRICS = strip(readFileSync(join(root, "src/lib/metrics.ts"), "utf8"));
check(/emitQuietly\(orgId, "alert\.created"/.test(METRICS),
  "alert.created fires from the alert-raising path in lib/metrics.ts");
check(/if \(!error\)/.test(METRICS),
  "…only when the alert insert actually succeeded",
  "a duplicate-key race means the alert was already open and already announced; firing again double-notifies");

const COLL = strip(readFileSync(join(root, "src/lib/collections/index.ts"), "utf8"));
check(/"invoice\.overdue"/.test(COLL),
  "invoice.overdue fires from the collections draft path");
check(/c\.attempts === 0/.test(COLL),
  "…once per invoice, not once per reminder",
  "three attempts on one late invoice must not produce three identical webhooks");

console.log(`\nwebhook-events: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`  ${events.length} advertised events, all emitted; no orphan emitters.`);
