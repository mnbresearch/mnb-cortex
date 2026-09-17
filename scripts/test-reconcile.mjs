/**
 * The reconciliation contract — and the schema it depends on — against real
 * PostgreSQL.
 *
 * WHY THIS IS NOT A UNIT TEST OF reconcilePayments().
 *
 * That function's body is Supabase calls and a Cashfree fetch; mocking both
 * would leave a test that proves my mocks agree with each other. What can be
 * proved for real is the part that actually failed before:
 *
 *   1. THE QUEUES EXIST AND SELECT THE RIGHT ROWS. `status = 'paid' and
 *      granted_at is null` has to mean "took money, delivered nothing". That is
 *      a claim about the schema and the data, and PGlite can answer it.
 *
 *   2. ONE PAYMENT CANNOT GRANT TWICE. The unique index on credit_ledger is the
 *      only thing standing between the verify route and the webhook, which run
 *      concurrently by design. Executed here: two grants with the same reason,
 *      second must be refused by the database.
 *
 *   3. THE CODE READS THE QUEUES IT CLAIMS TO. Asserted against the source,
 *      because a reconciliation job that queries the wrong column is worse than
 *      none — it reports "all clear" for ever.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
let pass = 0;
const failures = [];
const ok = (name, cond, why = "") => (cond ? pass++ : failures.push(`${name}${why ? "\n      " + why : ""}`));
const eq = (name, got, want, why = "") =>
  (got === want ? pass++ : failures.push(`${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}${why ? "\n      " + why : ""}`));

const db = await PGlite.create();

/* Minimal schema: the two tables the money path uses, plus the migration under
   test applied on top exactly as it will be in production. */
await db.exec(`
  create table organizations (
    id uuid primary key default gen_random_uuid(),
    name text, credits bigint default 0,
    plan text, subscription_status text, subscription_cycle text,
    subscription_ends_at timestamptz, credits_reset_at timestamptz
  );
  create table cortex_payments (
    order_id text primary key, org_id uuid, kind text, ref text,
    amount numeric, status text default 'paid', provider text default 'cashfree',
    created_at timestamptz default now()
  );
  create table credit_ledger (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references organizations(id) on delete cascade,
    user_id uuid, delta bigint not null, balance_after bigint,
    reason text, meta jsonb default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create or replace function grant_credits(p_org uuid, p_amount bigint, p_user uuid, p_reason text, p_meta jsonb)
  returns bigint language plpgsql as $$
  declare cur bigint; nb bigint;
  begin
    select credits into cur from organizations where id = p_org for update;
    if cur is null then cur := 0; end if;
    nb := greatest(cur + p_amount, 0);
    update organizations set credits = nb where id = p_org;
    insert into credit_ledger(org_id, user_id, delta, balance_after, reason, meta)
      values (p_org, p_user, p_amount, nb, p_reason, coalesce(p_meta, '{}'::jsonb));
    return nb;
  end $$;
`);

/* The migration, verbatim. If it cannot be applied twice it is not safe to
   re-run, and every migration in this repo has to be. */
const migration = readFileSync(join(root, "supabase/migrations/2026_zzzi_payment_integrity.sql"), "utf8")
  .replace(/create\s+extension[^;]*;/gi, "");
try {
  await db.exec(migration);
  await db.exec(migration);
  pass += 1;
  console.log("  ok    2026_zzzi_payment_integrity.sql applies, twice");
} catch (e) {
  failures.push(`the migration failed to apply: ${String(e.message).split("\n")[0]}`);
}

/* ======================================================================= */
console.log("\nTHE QUEUE — paid, and nothing delivered");
/* ======================================================================= */

const org = (await db.query(
  `insert into organizations (name, credits) values ('Sharma Steel', 0) returning id`)).rows[0].id;

await db.exec(`
  insert into cortex_payments (order_id, org_id, kind, ref, amount, status, granted_at, created_at) values
    -- delivered: the normal case
    ('ok_1',      '${org}', 'credits', 'pack_10k', 8999, 'paid',   now(), now() - interval '2 days'),
    -- took the money, never confirmed a grant: THE QUEUE
    ('stuck_1',   '${org}', 'credits', 'pack_10k', 8999, 'paid',   null,  now() - interval '2 days'),
    ('stuck_2',   '${org}', 'plan',    'command', 39999, 'paid',   null,  now() - interval '5 hours'),
    -- mid-flight: settled ninety seconds ago, not a discrepancy
    ('inflight',  '${org}', 'credits', 'pack_10k', 8999, 'paid',   null,  now() - interval '90 seconds'),
    -- a renewal whose grant failed outright
    ('sub_x_1',   '${org}', 'subscription:command', 'sub_x', 39999, 'grant_failed', null, now() - interval '1 day'),
    -- deliberately refused, not owed anything
    ('mismatch',  '${org}', 'plan',    'command',   100, 'amount_mismatch', null, now() - interval '1 day');
`);

{
  const q = await db.query(`
    select order_id from cortex_payments
     where status = 'paid' and granted_at is null
       and created_at < now() - interval '20 minutes'
     order by order_id`);
  const ids = q.rows.map((r) => r.order_id);
  eq("the queue finds exactly the rows that took money and delivered nothing",
     ids.join(","), "stuck_1,stuck_2",
     "ok_1 is delivered, inflight is 90s old, mismatch was refused on purpose");
}

{
  /* The partial index the queue relies on has to exist, or this query
     table-scans cortex_payments on every superadmin page load. */
  const q = await db.query(`select indexname from pg_indexes where indexname = 'idx_cortex_payments_ungranted'`);
  ok("the queue is indexed", q.rows.length === 1);
}

{
  const q = await db.query(`
    select count(*)::int as n from cortex_payments
     where granted_at is null and status in ('paid','grant_failed','grant_unverified')
       and created_at < now() - interval '20 minutes'`);
  eq("the failure statuses join the same queue", q.rows[0].n, 3,
     "stuck_1, stuck_2 and the failed renewal — all owed something");
}

/* ======================================================================= */
console.log("\nONE PAYMENT, ONE GRANT — enforced by the database");
/* ======================================================================= */

{
  const reason = "topup:pack_10k:order_abc";
  const first = await db.query(`select grant_credits('${org}', 10000, null, '${reason}', '{}'::jsonb) as bal`);
  eq("the first grant lands", Number(first.rows[0].bal), 10000);

  let refused = false;
  let message = "";
  try {
    await db.query(`select grant_credits('${org}', 10000, null, '${reason}', '{}'::jsonb) as bal`);
  } catch (e) { refused = true; message = String(e.message); }

  ok("a SECOND grant with the same reason is refused by the database", refused,
     "the verify route and the webhook run concurrently; both read 'no prior grant' and both granted — "
     + "one payment delivered two packs. A read cannot exclude a writer, so the guard has to be a constraint.");
  ok("...and the error is recognisably a uniqueness violation",
     /duplicate key|unique/i.test(message),
     "settle.ts matches on this to report 'already granted' instead of a failure");

  const bal = (await db.query(`select credits from organizations where id = '${org}'`)).rows[0].credits;
  eq("the balance shows one pack, not two", Number(bal), 10000);
}

{
  /* Two DIFFERENT partial refunds against one order must both be allowed —
     the reason carries the refund's own id for exactly this reason. */
  await db.query(`select grant_credits('${org}', -1000, null, 'refund_reversal:order_abc:rf_1', '{}'::jsonb)`);
  let secondAllowed = true;
  try {
    await db.query(`select grant_credits('${org}', -1000, null, 'refund_reversal:order_abc:rf_2', '{}'::jsonb)`);
  } catch { secondAllowed = false; }
  ok("two distinct partial refunds on one order are both allowed", secondAllowed,
     "if the reason were keyed on the order alone, the second partial would be silently refused");

  let dupeRefused = false;
  try {
    await db.query(`select grant_credits('${org}', -1000, null, 'refund_reversal:order_abc:rf_1', '{}'::jsonb)`);
  } catch { dupeRefused = true; }
  ok("...but a REPEAT of the same refund event is refused", dupeRefused,
     "a retried refund webhook must not claw back twice");

  const bal = (await db.query(`select credits from organizations where id = '${org}'`)).rows[0].credits;
  eq("the balance reflects exactly two reversals", Number(bal), 8000);
}

/* ======================================================================= */
console.log("\nONE REFUND EVENT, ONE REVERSAL");
/* ======================================================================= */

{
  /*
    The guard that replaced a single `reversed_at` flag. That flag failed both
    ways: a successful PARTIAL set it, so the later full refund lost its claim
    and reversed nothing; and a partial PLAN refund had no guard at all,
    because plan reversals write no ledger row.
  */
  await db.exec(`insert into payment_refunds (order_id, event_id, event_type, amount) values ('ord_1', 'rf_1', 'REFUND_SUCCESS', 500)`);

  let dupeRefused = false, message = "";
  try {
    await db.exec(`insert into payment_refunds (order_id, event_id, event_type, amount) values ('ord_1', 'rf_1', 'REFUND_SUCCESS', 500)`);
  } catch (e) { dupeRefused = true; message = String(e.message); }
  ok("a duplicate delivery of the same refund event is refused", dupeRefused);
  ok("...recognisably, so the handler can report 'already handled'",
     /duplicate key|unique/i.test(message));

  let secondPartial = true;
  try {
    await db.exec(`insert into payment_refunds (order_id, event_id, event_type, amount) values ('ord_1', 'rf_2', 'REFUND_SUCCESS', 500)`);
  } catch { secondPartial = false; }
  ok("a SECOND, genuinely different partial refund is allowed through", secondPartial,
     "this is what the single reversed_at flag blocked — the customer was refunded in full and kept the product");

  /* And the arithmetic reads sums over these rows rather than a column two
     concurrent handlers overwrite. */
  await db.exec(`update payment_refunds set credits_taken = 625, days_removed = 1 where order_id = 'ord_1' and event_id = 'rf_1'`);
  await db.exec(`update payment_refunds set credits_taken = 625, days_removed = 1 where order_id = 'ord_1' and event_id = 'rf_2'`);
  const sums = (await db.query(`
    select coalesce(sum(amount),0)::numeric as amt,
           coalesce(sum(credits_taken),0)::bigint as cr,
           coalesce(sum(days_removed),0)::int as dy
      from payment_refunds where order_id = 'ord_1'`)).rows[0];
  eq("refunded-so-far is a sum of events", Number(sums.amt), 1000);
  eq("credits already reclaimed is a sum of events", Number(sums.cr), 1250);
  eq("days already removed is a sum of events", Number(sums.dy), 2,
     "without this, a full refund after two partials removed the whole cycle a second time");
}

/* ======================================================================= */
console.log("\nTHE BACKFILL — no row may assert a grant it cannot evidence");
/* ======================================================================= */

{
  /*
    granted_at arrived with no backfill in the first version, so every
    historical payment would have looked unfulfilled: the console would list the
    whole payment history as "paid, nothing delivered", and the reconciliation
    job would have called settleOrder on all of it — re-granting plans to
    workspaces that had since moved on.

    The backfill asks each row for evidence instead. These two rows are the test
    of that: one has a ledger entry, one does not.
  */
  const org2 = (await db.query(`insert into organizations (name, plan) values ('Backfill Co', 'command') returning id`)).rows[0].id;
  await db.exec(`
    insert into cortex_payments (order_id, org_id, kind, ref, amount, status, granted_at, created_at) values
      ('bf_evidenced', '${org2}', 'credits', 'pack_10k', 8999, 'paid', null, now() - interval '30 days'),
      ('bf_bare',      '${org2}', 'credits', 'pack_10k', 8999, 'paid', null, now() - interval '30 days'),
      ('bf_plan',      '${org2}', 'plan',    'command', 39999, 'paid', null, now() - interval '30 days');
    insert into credit_ledger (org_id, delta, balance_after, reason)
      values ('${org2}', 10000, 10000, 'topup:pack_10k:bf_evidenced');
  `);

  /* Re-run just the backfill statements from the migration. */
  const backfill = migration.split("-- 1-3")[1].split("comment on column")[0];
  await db.exec(backfill.replace(/^[\s\S]*?update cortex_payments/, "update cortex_payments"));

  const rows = (await db.query(`select order_id, granted_at is not null as marked from cortex_payments where order_id like 'bf\\_%' order by order_id`)).rows;
  const byId = Object.fromEntries(rows.map((r) => [r.order_id, r.marked]));
  ok("a credits row WITH a matching ledger entry is marked granted", byId.bf_evidenced === true);
  ok("a credits row with no ledger entry is NOT marked", byId.bf_bare === false,
     "asserting delivery for a row where delivery is unknown would bury a real loss for ever");
  ok("a plan row whose workspace is still on that plan is marked", byId.bf_plan === true);
}

/* ======================================================================= */
console.log("\nINTENTS — the other half of the diff");
/* ======================================================================= */

{
  await db.exec(`
    insert into payment_intents (order_id, org_id, kind, ref, amount, created_at, settled_at) values
      ('int_open',    '${org}', 'plan', 'command', 39999, now() - interval '2 hours', null),
      ('int_fresh',   '${org}', 'plan', 'command', 39999, now() - interval '1 minute', null),
      ('int_closed',  '${org}', 'plan', 'command', 39999, now() - interval '3 days',  now());
  `);
  const q = await db.query(`
    select order_id from payment_intents
     where settled_at is null and created_at < now() - interval '20 minutes' order by order_id`);
  eq("only intents past the grace window are worked", q.rows.map((r) => r.order_id).join(","), "int_open",
     "a customer still on the Cashfree page is not a discrepancy");

  const idx = await db.query(`select indexname from pg_indexes where indexname = 'idx_payment_intents_open'`);
  ok("open intents are indexed", idx.rows.length === 1);
}

{
  /* An intent must survive its workspace being deleted, or erasure would
     destroy the financial trail. */
  await db.exec(`insert into organizations (id, name) values ('22222222-2222-2222-2222-222222222222', 'Doomed')`);
  await db.exec(`insert into payment_intents (order_id, org_id, amount) values ('int_orphan', '22222222-2222-2222-2222-222222222222', 500)`);
  await db.exec(`delete from organizations where id = '22222222-2222-2222-2222-222222222222'`);
  const q = await db.query(`select org_id, amount from payment_intents where order_id = 'int_orphan'`);
  ok("deleting a workspace keeps the intent and nulls its link",
     q.rows.length === 1 && q.rows[0].org_id === null,
     "on delete set null, not cascade: the money happened whether or not the workspace still exists");
}

/* ======================================================================= */
console.log("\nOPERATOR ALERTS — somewhere for a failure to go");
/* ======================================================================= */

{
  await db.exec(`insert into operator_alerts (kind, title, body, order_id) values ('refund_unmatched', 'Refund for an unknown order', 'test', 'zzz')`);
  const q = await db.query(`select count(*)::int as n from operator_alerts where resolved_at is null`);
  eq("an unresolved alert is queryable", q.rows[0].n, 1);

  /* org_id must be nullable: a refund for an order we have no record of has no
     workspace, and that is exactly the case that must not be dropped. */
  let nullOrgOk = true;
  try {
    await db.exec(`insert into operator_alerts (kind, title, org_id) values ('x', 'no workspace', null)`);
  } catch { nullOrgOk = false; }
  ok("an alert with no workspace can still be recorded", nullOrgOk);

  const rls = await db.query(`select relrowsecurity from pg_class where relname = 'operator_alerts'`);
  ok("operator_alerts is service-role only (RLS on, no policy)", rls.rows[0].relrowsecurity === true,
     "it carries order ids and workspace ids across every tenant");
  const pol = await db.query(`select count(*)::int as n from pg_policies where tablename = 'operator_alerts'`);
  eq("...with no policy at all", pol.rows[0].n, 0);
}

/* ======================================================================= */
console.log("\nTHE JOB READS WHAT IT CLAIMS TO");
/* ======================================================================= */

{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const rec = strip(readFileSync(join(root, "src/lib/pay/reconcile.ts"), "utf8"));

  ok("it works the intents table", /from\("payment_intents"\)/.test(rec));
  ok("it works the ungranted queue", /is\("granted_at", null\)/.test(rec));
  ok("it asks Cashfree rather than trusting our own row", /getOrder\(/.test(rec));
  ok("it repairs through settleOrder, never by granting directly",
     /settleOrder\(/.test(rec) && !/grant_credits|grantCredits/.test(rec),
     "granting on its own authority would let a reconciliation run invent an entitlement");
  ok("an unreachable provider leaves the intent open", /order\.unknown/.test(rec));
  ok("it refuses to guess at subscription rows",
     /startsWith\("subscription"\)/.test(rec),
     "sub_<mandate>_<payment> is not a Cashfree order id; getOrder would report 'not paid' and settleOrder would refuse");
  ok("it tells the operator", /operatorAlert\(/.test(rec));
  ok("it has a dry run", /dryRun/.test(rec));
  ok("the queues ROTATE rather than sorting by age",
     /reconcile_checked_at/.test(rec) && /nullsFirst: true/.test(rec),
     "sorted by created_at, forty unrepairable rows at the head mean no lost payment is ever examined again");
  ok("...and every row it looks at is stamped before the work, not after",
     /stamp\(svc, "payment_intents", orderId\)/.test(rec) && /stamp\(svc, PAYMENTS_TABLE, orderId\)/.test(rec));

  const settle = strip(readFileSync(join(root, "src/lib/pay/settle.ts"), "utf8"));
  ok("settleOrder can actually repair the statuses reconcile feeds it",
     /REPAIRABLE/.test(settle) && /grant_failed/.test(settle) && /grant_unverified/.test(settle),
     "refusing anything not exactly 'paid' made both reconciliation queues permanently unresolvable");
  /*
    BOTH PRESENT, AND IN THAT ORDER.

    Comparing indexOf() alone passed when the reservation was deleted outright:
    indexOf returns -1, and -1 is less than any real index, so removing the
    guard satisfied the assertion. A test whose pass condition includes "the
    thing is absent" is worse than no test.
  */
  const iReserve = settle.indexOf("period_to: endsAt");
  const iGrant = settle.indexOf("subscription_ends_at: endsAt");
  ok("the paid period is RESERVED before the workspace is updated",
     iReserve >= 0 && iGrant >= 0 && iReserve < iGrant,
     "recording it afterwards leaves the window where a re-grant stacks a second period");

  const route = strip(readFileSync(join(root, "src/app/api/cron/reconcile/route.ts"), "utf8"));
  ok("the endpoint is CRON_SECRET-only", /cronAuthorised\(req\)/.test(route));
  ok("...and answers non-2xx when something needs a human",
     /409/.test(route) && /unresolved\.length/.test(route),
     "a 200 with a body nobody reads is how the cron coverage numbers stayed invisible for months");

  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  ok("it is actually scheduled",
     (vercel.crons || []).some((c) => c.path === "/api/cron/reconcile"),
     "a reconciliation job nobody runs is a comment");

  const order = strip(readFileSync(join(root, "src/app/api/pay/cashfree/order/route.ts"), "utf8"));
  /* The table name must be the REAL one. `/payment_intents/` alone passed when
     the call was pointed at `payment_intents_disabled`, which is exactly the
     kind of near-miss a mutation check exists to catch. */
  ok("checkout records an intent, or there is nothing to reconcile against",
     /from\("payment_intents"\)\s*\.insert\(/.test(order));
}

console.log(`\nreconcile: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  The queues select the right rows, the database refuses a double grant, and the job is scheduled.");
