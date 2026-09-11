/*
  THE COLLECTIONS DRY RUN — ARITHMETIC.

  Run with:  npm run test:collections-preview

  This screen is the one that asks an owner to let software write, in their
  name, to the people who owe them money. Every number on it is load-bearing:
  a count that disagrees with the total beside it does not merely look sloppy,
  it withdraws the only thing the card is trying to establish.

  The first version of shapePreview did exactly that — reported a 25-row display
  slice as the count next to a total summed over all qualifying invoices. These
  assertions exist because that bug was caught by reading, and reading does not
  scale.

  Executes the real module. `import "server-only"` lives in preview.ts; this
  file imports preview-shape.ts, which has no imports at all, precisely so it
  can be loaded here.
*/

import { shapePreview, channelFor, DISPLAY_LIMIT } from "../src/lib/collections/preview-shape.ts";

let pass = 0;
const fails = [];

/** check(condition, name, detail) — matching the convention in the other suites. */
function check(cond, name, detail = "") {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const c = (over = {}) => ({
  party: "Acme",
  invoiceNo: "INV-1",
  amount: 1000,
  daysPastDue: 10,
  blockedBy: null,
  contact: { email: "a@b.com", phone: null },
  ...over,
});

/* ------------------------------------------------------------------ empty */
{
  const s = shapePreview([]);
  check(s.wouldChaseCount === 0, "empty: count is 0");
  check(s.wouldChaseValue === 0, "empty: value is 0");
  check(s.wouldChase.length === 0, "empty: no rows");
  check(s.excluded.length === 0, "empty: no exclusions");
  check(s.excludedValue === 0, "empty: exclusion value 0");
  check(s.top === null, "empty: no top candidate");
}

/* Defensive: a caller handing us something that is not an array must not throw
   on a page that is otherwise rendering fine. */
{
  const s = shapePreview(/** @type {any} */ (null));
  check(s.wouldChaseCount === 0, "null input: treated as empty, does not throw");
}

/* ------------------------------------- THE BUG THIS FILE EXISTS TO PREVENT */
{
  /* 40 qualifying invoices: more than the 25-row display slice. */
  const many = Array.from({ length: 40 }, (_, i) => c({ amount: 100 + i, invoiceNo: `INV-${i}` }));
  const s = shapePreview(many);

  check(s.wouldChase.length === DISPLAY_LIMIT, "40 candidates: display slice is capped", `got ${s.wouldChase.length}`);
  check(s.wouldChaseCount === 40, "40 candidates: COUNT is all of them, not the slice", `got ${s.wouldChaseCount}`);

  const total = many.reduce((n, x) => n + x.amount, 0);
  check(s.wouldChaseValue === total, "40 candidates: value covers all of them", `got ${s.wouldChaseValue}, want ${total}`);

  /* The invariant stated directly: count and value describe the same set. */
  const sliceTotal = s.wouldChase.reduce((n, x) => n + x.amount, 0);
  check(
    s.wouldChaseValue !== sliceTotal,
    "40 candidates: value is NOT the slice total (the original bug)",
    `both were ${sliceTotal}`,
  );
}

/* ------------------------------------------------------ ordering and top */
{
  const s = shapePreview([
    c({ party: "Small", amount: 500 }),
    c({ party: "Huge", amount: 90000 }),
    c({ party: "Mid", amount: 4000 }),
  ]);
  check(s.wouldChase[0].party === "Huge", "sorted biggest first", s.wouldChase[0].party);
  check(s.wouldChase[2].party === "Small", "smallest last", s.wouldChase[2].party);
  check(s.top && s.top.party === "Huge", "top is the biggest — the sample message matches row one");
}

/* The sample must be the first row of the table it sits under. If these ever
   diverge the owner reads a message addressed to someone they cannot see. */
{
  const s = shapePreview(Array.from({ length: 30 }, (_, i) => c({ party: `P${i}`, amount: i * 10 })));
  check(s.top.party === s.wouldChase[0].party, "top always equals the first displayed row");
}

/* ------------------------------------------------------------- exclusions */
{
  const s = shapePreview([
    c({ amount: 1000 }),
    c({ amount: 2000, blockedBy: "No email or phone on file for this customer" }),
    c({ amount: 3000, blockedBy: "No email or phone on file for this customer" }),
    c({ amount: 500, blockedBy: "Not due yet" }),
  ]);

  check(s.wouldChaseCount === 1, "only unblocked candidates are chased", `got ${s.wouldChaseCount}`);
  check(s.wouldChaseValue === 1000, "blocked amounts stay out of the chase total", `got ${s.wouldChaseValue}`);
  check(s.excluded.length === 2, "exclusions grouped by reason", `got ${s.excluded.length}`);
  check(s.excluded[0].reason.startsWith("No email"), "biggest exclusion group first", s.excluded[0].reason);
  check(s.excluded[0].count === 2, "group count correct", String(s.excluded[0].count));
  check(s.excluded[0].value === 5000, "group value correct", String(s.excluded[0].value));
  check(s.excludedValue === 5500, "excluded total covers every reason", String(s.excludedValue));

  /* Nothing may be double counted or dropped: the two totals must reconcile
     with the input, because both appear on screen at once. */
  check(s.wouldChaseValue + s.excludedValue === 6500, "chased + excluded === everything in");
}

/* A blocked candidate must never supply the sample message — that would show
   the owner a draft for someone the product has just promised not to write to. */
{
  const s = shapePreview([c({ party: "Blocked", amount: 99999, blockedBy: "On your do-not-contact list" })]);
  check(s.top === null, "all-blocked: no sample candidate");
  check(s.wouldChaseCount === 0, "all-blocked: nothing chased");
  check(s.excludedValue === 99999, "all-blocked: full value shown as excluded");
}

/* ----------------------------------------------------------------- channel */
{
  check(channelFor(c({ contact: { email: "x@y.z", phone: "9" } })) === "email", "email wins when both present");
  check(channelFor(c({ contact: { email: null, phone: "9" } })) === "whatsapp", "phone only -> whatsapp");
  check(channelFor(c({ contact: { email: null, phone: null } })) === "none", "neither -> none");
  check(channelFor(c({ contact: { email: "", phone: "" } })) === "none", "empty strings are not contacts");
}

/* ------------------------------------------------------- dirty amounts */
{
  /* Amounts arrive from Postgres numeric and can be strings; a NaN must
     contribute zero rather than poisoning the whole total into "₹NaN". */
  const s = shapePreview([
    c({ amount: "1500.50" }),
    c({ amount: null }),
    c({ amount: undefined }),
    c({ amount: "not a number" }),
  ]);
  check(s.wouldChaseValue === 1500.5, "numeric strings parsed, junk counts as zero", String(s.wouldChaseValue));
  check(Number.isFinite(s.wouldChaseValue), "total is never NaN");
  check(s.wouldChaseCount === 4, "unparseable amounts are still counted as invoices", String(s.wouldChaseCount));
}

/* -------------------------------------------------------------- no mutation */
{
  const input = [c({ party: "A", amount: 1 }), c({ party: "B", amount: 2 })];
  const order = input.map((x) => x.party).join(",");
  shapePreview(input);
  check(input.map((x) => x.party).join(",") === order, "caller's array is not re-ordered in place", order);
}

/* --------------------------------------------------------------- report */
console.log(`\ncollections preview: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(1);
}
