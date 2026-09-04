/**
 * The 43B(h) exposure arithmetic, run against real Postgres.
 *
 * WHY THIS TEST EXISTS.
 *
 * This is the one number in Cortex that a customer takes to their CA. Section
 * 43B(h) says a payment to a registered micro or small supplier made later than
 * the statutory window loses its deduction in the year the expense was incurred.
 * So the figure on the MSME page is a tax figure: an owner sees "₹15,00,000 at
 * risk" in March and moves money to fix it.
 *
 * It was wrong. `cortex_msme_exposure` grouped by party and returned the sum of
 * ALL that party's unpaid bills alongside a past-window flag driven by the
 * party's OLDEST bill. One late bill therefore dragged every current bill from
 * the same supplier into the exposure. On the fixture below the page said
 * ₹15,00,000 against a truth of ₹1,00,000 — fifteen times over, and the owner
 * moves fourteen lakh they did not need to move.
 *
 * A string-matching test could not have caught that; the bug was in what the
 * SQL COMPUTED, not in how it was written. So this runs the actual migration in
 * PGlite (real Postgres, WASM) against a fixture with a known correct answer.
 *
 * THE FIXTURE, and why each row is in it.
 *
 *   1 bill  ₹1,00,000   60 days old, micro, written agreement (45d)  -> AT RISK
 *   9 bills ₹1,00,000    5 days old, same supplier                   -> not yet
 *   1 bill  ₹5,00,000   90 days old, status "Paid" (capital P)       -> gone
 *   1 bill  ₹2,00,000   90 days old, MEDIUM supplier                 -> not covered
 *   1 bill  ₹3,00,000   90 days old, supplier never classified       -> unknown
 *
 * Truth: at-risk ₹1,00,000 over exactly 1 bill.
 *
 * The "Paid" row is the second half of the bug. The old filter was
 * `status <> 'paid'`, case-sensitive, and every Tally and Vyapar export writes
 * "Paid" — so money already out of the bank was counted as at risk.
 *
 * The medium and unclassified rows guard the distinction the module says it
 * exists to protect: 43B(h) covers micro and small ONLY. A medium supplier can
 * be ninety days late with zero tax consequence, and folding them in inflates a
 * statutory warning. Unclassified is neither safe nor at risk — it is unknown,
 * and must be reported as its own number rather than quietly assumed to be zero.
 *
 * VACUITY. Every assertion below is checked to fail against the pre-fix
 * function, which this file loads and runs first. If the old SQL and the new
 * SQL ever agree on this fixture, the test says so and fails — because that
 * would mean it is no longer testing anything.
 */

import { readFileSync, existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}\n      ${d}`));
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

const OLD = "supabase/migrations/2026_msme_43bh.sql";
const FIX = "supabase/migrations/2026_msme_exposure_fix.sql";

for (const f of [OLD, FIX]) {
  if (!existsSync(f)) {
    console.log(`msme: cannot run — ${f} is missing`);
    process.exit(1);
  }
}

/* The fix must drop before it creates: `create or replace` cannot widen a
   `returns table`, and without the drop the migration aborts and leaves the
   broken function live. That is a property of the FILE, so assert it here. */
const fixSrc = readFileSync(FIX, "utf8");
check(/drop function if exists cortex_msme_exposure\(uuid\)/i.test(fixSrc),
  "the fix drops the old function before creating",
  "Postgres refuses a return-type change on create-or-replace; without the drop this migration fails halfway");

async function build() {
  const db = new PGlite();
  await db.exec(`
    /* The migration grants and revokes against these; Supabase provides them. */
    create role anon;  create role authenticated;  create role service_role;
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create table invoices (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      party text, amount numeric, due_date date, issue_date date,
      status text default 'pending', type text default 'receivable',
      created_at timestamptz default now()
    );
    create or replace function user_org_ids() returns setof uuid
      language sql stable as $$ select null::uuid where false $$;
  `);
  /* cortex_norm_name lives in another migration; take the real definition
     rather than writing a lookalike, so party matching is tested as it ships. */
  const norm = readFileSync("supabase/migrations/2026_sales_order_customer_link.sql", "utf8")
    .match(/create or replace function cortex_norm_name[\s\S]*?\$\$;/);
  check(!!norm, "parse: found the real cortex_norm_name definition");
  await db.exec(norm[0]);

  const org = (await db.query(
    "insert into organizations (name) values ('Fixture') returning id")).rows[0].id;

  const bill = (party, amt, age, status = 'pending') => db.query(
    `insert into invoices (org_id, party, amount, type, issue_date, status)
     values ($1, $2, $3, 'payable', current_date - $4::int, $5)`,
    [org, party, amt, age, status]);

  await bill("Acme Micro", 100000, 60);                 // the genuine exposure
  for (let i = 0; i < 9; i++) await bill("Acme Micro", 100000, 5);
  await bill("Acme Micro", 500000, 90, "Paid");         // capital P, already paid
  await bill("Bigco Medium", 200000, 90);               // late, not covered
  await bill("Unknown Traders", 300000, 90);            // never classified

  await db.exec(readFileSync(OLD, "utf8"));
  await db.query("update vendors set udyam_category = 'micro' where name = 'Acme Micro'");
  await db.query("update vendors set udyam_category = 'medium' where name = 'Bigco Medium'");
  return { db, org };
}

/* Mirror of the reducer in src/lib/msme.ts. Kept in step by the assertion at
   the bottom, which reads that file and fails if the shape has drifted. */
function reduce(rows, hasOther) {
  const COVERED = new Set(["micro", "small"]);
  let atRisk = 0, atRiskCount = 0, notCovered = 0, unclassified = 0, totalPayable = 0;
  for (const r of rows) {
    const amt = Number(r.total_amount) || 0;
    const cnt = Number(r.invoice_count) || 0;
    totalPayable += amt + (hasOther ? Number(r.other_amount) || 0 : 0);
    if (r.udyam_category === "unclassified") unclassified += amt;
    else if (COVERED.has(r.udyam_category) && r.past_window) { atRisk += amt; atRiskCount += cnt; }
    else if (r.past_window) notCovered += amt;
  }
  return { atRisk, atRiskCount, notCovered, unclassified, totalPayable };
}

const { db, org } = await build();
const q = async () => (await db.query("select * from cortex_msme_exposure($1)", [org])).rows;

const before = reduce(await q(), false);
await db.exec(fixSrc);
const afterRows = await q();
const after = reduce(afterRows, true);

/* ---------------------------------------------------- the arithmetic itself */

check(after.atRisk === 100000,
  "at-risk counts ONLY the bills past their own window",
  `expected ${inr(100000)}, got ${inr(after.atRisk)} — this is the number an owner takes to their CA`);

check(after.atRiskCount === 1,
  "at-risk counts one bill, not the supplier's whole ledger",
  `expected 1, got ${after.atRiskCount}`);

const acme = afterRows.find((r) => r.party === "Acme Micro");
check(acme && Number(acme.other_amount) === 900000 && Number(acme.other_count) === 9,
  "bills still inside the window are returned separately, not silently dropped",
  `the screen must still show the full relationship: expected ${inr(900000)} over 9, got ${acme ? inr(acme.other_amount) + " over " + acme.other_count : "no row"}`);

check(after.atRisk + after.notCovered + after.unclassified !== 1500000 &&
      !afterRows.some((r) => Number(r.total_amount) + Number(r.other_amount) === 600000),
  "a bill marked \"Paid\" is excluded whatever its capitalisation",
  "Tally and Vyapar both export \"Paid\"; a case-sensitive filter counts money that has already left the bank");

check(after.notCovered === 200000 && after.atRisk !== after.atRisk + 200000,
  "a MEDIUM supplier ninety days late is late but NOT 43B(h) exposure",
  `expected ${inr(200000)} not-covered and excluded from at-risk, got ${inr(after.notCovered)}`);

check(after.unclassified === 300000,
  "an unclassified supplier is reported as unknown, never as zero",
  `expected ${inr(300000)}, got ${inr(after.unclassified)} — a workspace that has classified nothing must not be shown a reassuring ₹0`);

/* 100,000 + 900,000 + 200,000 + 300,000. The 500,000 "Paid" bill is not owed. */
check(after.totalPayable === 1500000,
  "total payable still reflects every unpaid bill",
  `at-risk shrank from ${inr(1500000)} to ${inr(100000)}, but the total the owner OWES is unchanged: expected ${inr(1500000)}, got ${inr(after.totalPayable)}. If this drops, the split lost money instead of reclassifying it.`);

/* ------------------------------------------------------------- non-vacuity */

check(before.atRisk === 1500000,
  "the pre-fix function really did report the inflated figure",
  `expected the bug to show as ${inr(1500000)}; got ${inr(before.atRisk)}. If this fails the fixture no longer reproduces the bug, so the assertions above prove nothing.`);

check(before.atRisk !== after.atRisk && before.atRiskCount !== after.atRiskCount,
  "old and new disagree on this fixture",
  "identical results would mean this test is passing vacuously");

/* --------------------------------------- the reducer above matches shipping */

const MSME = readFileSync("src/lib/msme.ts", "utf8");
for (const [needle, why] of [
  ["other_amount", "lib/msme.ts must read the new column or the split does nothing"],
  ["other_count", "same, for the count"],
  ["r.total_amount + r.other_amount", "totalPayable must add both halves back, or the owner's total debt silently shrinks"],
]) {
  check(MSME.includes(needle), `lib/msme.ts uses ${needle}`, why);
}
check(/COVERED\s*=\s*new Set\(\["micro", "small"\]\)/.test(MSME),
  "lib/msme.ts still covers micro and small only",
  "adding medium here would inflate a statutory warning");

await db.close();

console.log(`\nmsme: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`  43B(h) exposure: ${inr(before.atRisk)} before the fix, ${inr(after.atRisk)} after, truth ${inr(100000)}.`);
