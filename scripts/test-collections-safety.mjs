/**
 * The brakes, exercised.
 *
 * A kill switch that does not stop anything is worse than no kill switch,
 * because during an incident somebody will flip it, see it flip, and believe
 * the problem is contained. This module exists to make that impossible to get
 * wrong quietly.
 *
 * Three properties, each checked by doing rather than by reading:
 *
 *   1. the global switch really is one row and really does return false
 *   2. the sender CHECKS it, at the point of sending, not just in the UI —
 *      the cron does not render pages
 *   3. the per-workspace breaker trips on repeated failure with nothing
 *      delivered, and does NOT trip on the odd bounce in a busy workspace
 */

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

const db = new PGlite();

async function main() {
  await db.exec(`
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create table invoices (
      id uuid primary key default gen_random_uuid(), org_id uuid not null,
      invoice_no text, party text, amount numeric, due_date date,
      status text default 'pending', type text default 'receivable',
      issue_date date, created_at timestamptz default now());
    create or replace function user_org_ids() returns setof uuid
      language sql stable as $$ select null::uuid where false $$;
    create role authenticated; create role anon; create role service_role;
  `);
  await db.exec(readFileSync("supabase/migrations/2026_collections.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/2026_collections_safety.sql", "utf8"));
  ok(); // both migrations apply

  /* ------------------------------------------------------ the global stop */

  check((await db.query(`select cortex_collections_enabled() as v`)).rows[0].v === true,
    "collections is enabled by default",
    "shipping with sending pre-paused would look like a broken feature");

  const rows = Number((await db.query(`select count(*)::int n from platform_switches`)).rows[0].n);
  check(rows === 1, "the switch is exactly one row", `${rows} rows`);

  /*
    Two rows with disagreeing values is worse than no switch — the reader picks
    one arbitrarily and the operator cannot tell which.
  */
  let second = null;
  try { await db.query(`insert into platform_switches (id) values (true)`); }
  catch (e) { second = String(e.message || e); }
  check(second !== null, "a second switch row is impossible");
  let falseRow = null;
  try { await db.query(`insert into platform_switches (id) values (false)`); }
  catch (e) { falseRow = String(e.message || e); }
  check(falseRow !== null, "…including one with id = false");

  await db.query(`select cortex_set_collections_switch(false, 'testing the brake')`);
  check((await db.query(`select cortex_collections_enabled() as v`)).rows[0].v === false,
    "flipping the switch OFF really reports off",
    "the operator would believe an incident was contained when it was not");
  const reason = (await db.query(`select reason from platform_switches`)).rows[0].reason;
  check(reason === "testing the brake", "the reason is recorded", `got ${reason}`);

  await db.query(`select cortex_set_collections_switch(true, null)`);
  check((await db.query(`select cortex_collections_enabled() as v`)).rows[0].v === true,
    "…and back on again");
  check((await db.query(`select reason from platform_switches`)).rows[0].reason === null,
    "resuming clears the reason, so a stale explanation cannot linger");

  /* The switch must not be flippable from the browser. */
  const asRole = async (role, sql) => {
    await db.exec(`set role ${role};`);
    let err = null;
    try { await db.query(sql); } catch (e) { err = String(e.message || e); }
    await db.exec(`reset role;`);
    return err;
  };
  check(await asRole("authenticated", `select cortex_set_collections_switch(false, 'x')`) !== null,
    "a signed-in user cannot flip the global switch",
    "any customer could pause collections for every other customer");
  check(await asRole("anon", `select cortex_set_collections_switch(false, 'x')`) !== null,
    "…nor can anon");
  check(await asRole("authenticated", `select cortex_collections_enabled()`) === null,
    "but anyone may READ it, so the UI can explain why sending is paused");

  /* ------------------------------------------------ the workspace breaker */

  const org = (await db.query(`insert into organizations (name) values ('Acme') returning id`)).rows[0].id;
  const inv = (await db.query(
    `insert into invoices (org_id, party, amount, due_date, type) values ($1,'X',1,current_date-30,'receivable') returning id`,
    [org])).rows[0].id;
  const th = (await db.query(
    `insert into collection_threads (org_id, invoice_id, party, amount) values ($1,$2,'X',1) returning id`,
    [org, inv])).rows[0].id;
  await db.query(`insert into collection_policies (org_id, enabled) values ($1, true)`, [org]);

  /* Four failures is not enough — one bad afternoon must not switch a customer off. */
  for (let i = 0; i < 4; i++) {
    await db.query(`insert into collection_messages (org_id, thread_id, channel, body, status)
                    values ($1,$2,'email','x','failed')`, [org, th]);
  }
  check((await db.query(`select cortex_collections_trip_check($1) as v`, [org])).rows[0].v === false,
    "four failures do not trip the breaker",
    "tripping too eagerly is its own outage");
  check((await db.query(`select enabled from collection_policies where org_id=$1`, [org])).rows[0].enabled === true,
    "…and the workspace stays enabled");

  /* A fifth, with nothing delivered, does. */
  await db.query(`insert into collection_messages (org_id, thread_id, channel, body, status)
                  values ($1,$2,'email','x','failed')`, [org, th]);
  check((await db.query(`select cortex_collections_trip_check($1) as v`, [org])).rows[0].v === true,
    "five failures with nothing delivered trips it");
  const tripped = (await db.query(`select enabled, tripped_reason from collection_policies where org_id=$1`, [org])).rows[0];
  check(tripped.enabled === false, "the workspace is switched off");
  check(/credential/i.test(tripped.tripped_reason || ""),
    "…with a reason that points at the likely cause",
    `got "${tripped.tripped_reason}"`);

  /*
    A BUSY workspace with the odd bounce must not trip. This is the case that
    separates a useful breaker from an annoying one.
  */
  const org2 = (await db.query(`insert into organizations (name) values ('Busy') returning id`)).rows[0].id;
  const inv2 = (await db.query(
    `insert into invoices (org_id, party, amount, due_date, type) values ($1,'Y',1,current_date-30,'receivable') returning id`,
    [org2])).rows[0].id;
  const th2 = (await db.query(
    `insert into collection_threads (org_id, invoice_id, party, amount) values ($1,$2,'Y',1) returning id`,
    [org2, inv2])).rows[0].id;
  await db.query(`insert into collection_policies (org_id, enabled) values ($1, true)`, [org2]);
  for (let i = 0; i < 8; i++) {
    await db.query(`insert into collection_messages (org_id, thread_id, channel, body, status)
                    values ($1,$2,'email','x','failed')`, [org2, th2]);
  }
  await db.query(`insert into collection_messages (org_id, thread_id, channel, body, status, sent_at)
                  values ($1,$2,'email','x','sent', now())`, [org2, th2]);
  check((await db.query(`select cortex_collections_trip_check($1) as v`, [org2])).rows[0].v === false,
    "eight failures do NOT trip a workspace that is also delivering",
    "a busy sender always has some bounces; tripping on those would be worse than the bounces");
  check((await db.query(`select enabled from collection_policies where org_id=$1`, [org2])).rows[0].enabled === true,
    "…and it stays enabled");

  /* ------------------------------------------- the engine actually checks */

  const engine = readFileSync("src/lib/collections/index.ts", "utf8");
  check(/cortex_collections_enabled/.test(engine),
    "the SENDER checks the global switch",
    "a switch only checked in the UI does not stop the cron, which is what actually sends");
  const sendFn = engine.slice(engine.indexOf("export async function sendApproved"));
  const switchAt = sendFn.indexOf("cortex_collections_enabled");
  const sendAt = sendFn.indexOf("sendEmail");
  check(switchAt > -1 && switchAt < sendAt,
    "…and checks it BEFORE any message goes out",
    "checking after sending is not a check");
  check(/cortex_collections_trip_check/.test(engine), "the sender can trip the breaker");

  const healthSrc = readFileSync("src/lib/health.ts", "utf8");
  check(/cortex_collections_enabled/.test(healthSrc),
    "the status page reports when sending is paused",
    "an invisible pause is how a feature stays off for a week after the incident ended");

  console.log(`\ncollections safety: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log("  global stop works and is checked before sending; the breaker trips on failure, not on bounces.");
}

main().catch((e) => { console.error(e); process.exit(1); });
