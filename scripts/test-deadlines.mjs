/**
 * The statutory deadline arithmetic, against known dates.
 *
 * WHY THIS IS TESTED AND NOT EYEBALLED.
 *
 * "GST & statutory deadline warnings" is a bullet on a paid plan, and the thing
 * behind it used to be a static reference table on a page nobody opened. Now
 * that it produces sentences like "GSTR-3B is due in 4 days", the arithmetic is
 * something a customer acts on — and off-by-one on a tax deadline is the kind
 * of wrong that costs them money and costs us the account.
 *
 * The interesting cases are all at boundaries: the end of a month, the end of a
 * year, and the day a deadline actually falls. Each is pinned below against a
 * date computed by hand.
 */

import { upcomingDeadlines, describeDeadline, istToday } from "../src/lib/statutory.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}\n      ${d}`));

/* Noon UTC on the given IST date, safely inside the IST day either way. */
const at = (iso) => new Date(`${iso}T06:30:00Z`);
const ids = (list) => list.map((x) => x.id.replace(/-next$/, ""));

/* --------------------------------------------- the ordinary case */

// 16 September 2026. GSTR-3B (20th) is 4 days out; PMT-06 (25th) is 9.
const mid = upcomingDeadlines(10, at("2026-09-16"));
const gstr3b = mid.find((x) => x.id === "gstr3b");
check(gstr3b && gstr3b.daysAway === 4,
  "GSTR-3B is 4 days away on 16 September",
  `got ${gstr3b ? gstr3b.daysAway : "nothing"}`);
check(mid.find((x) => x.id === "pmt06")?.daysAway === 9,
  "PMT-06 is 9 days away on the same date");

check(!ids(mid).includes("gstr1"),
  "GSTR-1 (the 11th) is NOT reported on the 16th",
  "it has already passed; telling someone about a deadline they cannot now meet is noise");

check(mid.every((x) => x.daysAway >= 0),
  "nothing in the past is ever returned");

check(mid.every((x, i, a) => i === 0 || a[i - 1].daysAway <= x.daysAway),
  "results are ordered soonest-first");

/* ------------------------------------ the end-of-month wrap, which is the bug */

/*
  On the 28th, every monthly deadline for the current month is behind us. A
  naive implementation returns an empty list here — and an empty list on the
  28th of EVERY month is a feature that looks broken exactly when the next
  GSTR-1 is nine days out.
*/
const late = upcomingDeadlines(10, at("2026-09-28"));
check(late.length > 0,
  "the 28th still returns deadlines",
  "a window that empties at every month end would look broken twelve times a year");
const nextTds = late.find((x) => x.id.startsWith("tds") && x.name.includes("TDS / TCS"));
check(nextTds && nextTds.daysAway === 9,
  "next month's TDS deposit (7 Oct) is 9 days from 28 September",
  `got ${nextTds ? nextTds.daysAway : "nothing"}`);

/* --------------------------------------------- the year wrap */

// 28 December 2026 → 7 January 2027 TDS deposit is 10 days away.
const yearEnd = upcomingDeadlines(12, at("2026-12-28"));
const janTds = yearEnd.find((x) => x.name.includes("TDS / TCS"));
check(janTds && janTds.daysAway === 10,
  "December rolls into January correctly",
  `got ${janTds ? janTds.daysAway : "nothing"} — a December-to-January miss would be silent for one month a year`);
check(janTds && janTds.due.getUTCFullYear() === 2027,
  "…and the year increments");

/* ---------------------------------------- the day itself, and the day before */

const onTheDay = upcomingDeadlines(1, at("2026-09-20")).find((x) => x.id === "gstr3b");
check(onTheDay && onTheDay.daysAway === 0, "a deadline falling today reports 0 days");
check(onTheDay && /due today/.test(describeDeadline(onTheDay)),
  "…and reads as \"due today\", never \"in 0 days\"",
  onTheDay ? describeDeadline(onTheDay) : "");

const dayBefore = upcomingDeadlines(1, at("2026-09-19")).find((x) => x.id === "gstr3b");
check(dayBefore && /due tomorrow/.test(describeDeadline(dayBefore)),
  "…and \"tomorrow\", never \"in 1 days\"",
  dayBefore ? describeDeadline(dayBefore) : "");

/* ------------------------------------------------ the honesty requirement */

/*
  Cortex is never told whether a workspace files monthly or under QRMP, whether
  it is a company with ROC filings, or whether it deducts TDS at all. Every
  warning must therefore be conditional. Telling a sole proprietor they have
  missed AOC-4 would destroy their trust in every other warning we send.
*/
const all = upcomingDeadlines(400, at("2026-09-16"));
check(all.length > 15, "parse: the window returns the full set", `${all.length}`);
check(all.every((x) => x.appliesIf && x.appliesIf.length > 10),
  "every deadline carries the condition under which it applies");
check(all.every((x) => / if /.test(describeDeadline(x))),
  "…and every sentence states it",
  "an unconditional 'you must file AOC-4' is wrong for most of our customers");

/* Advance tax instalments must name their percentage — "pay your advance tax"
   without 15% or 75% is not something anyone can act on. */
const adv = all.filter((x) => x.name.startsWith("Advance tax"));
check(adv.length >= 4 && adv.every((x) => /%/.test(x.what)),
  "each advance-tax instalment states its percentage",
  `${adv.length} found`);

/* -------------------------------------- IST, not the server's timezone */

/*
  Vercel runs in UTC. At 23:00 IST the UTC date is still yesterday, so a
  server-local date would compute every deadline one day out for five and a
  half hours each night — the five and a half hours right before a midnight
  deadline, which is when it matters most.
*/
const lateNightIST = new Date("2026-09-16T18:00:00Z"); // 23:30 IST on the 16th
check(istToday(lateNightIST).d === 16,
  "the IST date is used, not the server's UTC date",
  `got day ${istToday(lateNightIST).d} — UTC would say 16 here too only by luck; see the next check`);
const pastMidnightIST = new Date("2026-09-16T19:00:00Z"); // 00:30 IST on the 17th
check(istToday(pastMidnightIST).d === 17,
  "…and rolls over at IST midnight, not UTC midnight",
  `got day ${istToday(pastMidnightIST).d}`);

console.log(`\nstatutory: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Deadlines are dated correctly across month and year boundaries, in IST, and always conditional.");
