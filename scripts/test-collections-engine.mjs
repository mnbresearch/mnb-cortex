/**
 * The collections send path, executed.
 *
 * WHY THIS SUITE EXISTS, when test-collections-safety.mjs already passes.
 *
 * That suite reads sendApproved()'s SOURCE as a string and asserts that certain
 * phrases appear in it. It cannot tell whether the guards run, whether they run
 * in the right order, or whether one of them tests a field that is always
 * undefined. It passes just as happily on code that never sends anything and on
 * code that sends everything.
 *
 * This is the highest-consequence path in the product: the messages go to the
 * customer's OWN customers, about money, signed with the customer's name. The
 * cost of a mistake is a business relationship, not a support ticket. It had no
 * executable test at all.
 *
 * Two halves, both real:
 *
 *   · The decision logic, now pure in lib/collections/rules.ts, run directly
 *     through every refusal scenario.
 *   · Stop-on-payment, which is a Postgres trigger, run against real Postgres
 *     in PGlite — including the case that matters most, an invoice paid AFTER
 *     its reminder was drafted and approved.
 *
 * No network, no provider, no Supabase. The "fake provider" is the ok/failed
 * outcome fed to shouldTripBreaker, which is the only thing the engine does
 * with a provider's answer.
 */

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { runGate, decideMessage, shouldTripBreaker } from "../src/lib/collections/rules.ts";
import { normalizeCustomerName } from "../src/lib/customer-match.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

const POLICY = {
  enabled: true, auto_send: false, tone: "polite", channels: ["email"],
  first_after_days: 3, min_gap_days: 7, max_attempts: 3, max_per_day: 25,
  send_from_hour: 9, send_to_hour: 19, do_not_contact: [],
  signature: null, payment_note: null, whatsapp_template: null, whatsapp_lang: "en",
};
const P = (over = {}) => ({ ...POLICY, ...over });

/* 11:00 IST — inside the default 9–19 window. */
const NOON = new Date("2026-09-17T05:30:00Z");
const alwaysOpen = () => true;
const realWindow = (p, now) => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now));
  const from = Number(p.send_from_hour), to = Number(p.send_to_hour);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return true;
  return from < to ? h >= from && h < to : h >= from || h < to;
};

const thread = (over = {}) => ({ status: "open", attempts: 0, last_sent_at: null, party: "Kirloskar Distributors", ...over });
const msg = (over = {}) => ({ recipient: "ap@kirloskar.example", channel: "email", ...over });
const decide = (over = {}) => decideMessage({
  policy: P(over.policy), thread: thread(over.thread), message: msg(over.message),
  now: over.now || NOON, normalise: normalizeCustomerName,
  channelReady: over.channelReady, channelNotReadyReason: over.channelNotReadyReason,
});

/* ========================================================= the kill switch */
{
  const g = runGate({ platformEnabled: false, policy: P(), sentToday: 0, now: NOON, withinWindow: alwaysOpen });
  check(g.allowed === false && g.room === 0,
    "the platform kill switch stops the run",
    "an operator halting every workspace must actually halt it, in the cron and not only in the UI");
  check(/paused across Cortex/i.test(g.note || ""),
    "…and says so, so support can see it was deliberate");

  /* Order matters: the switch must beat every per-workspace reason. */
  const both = runGate({ platformEnabled: false, policy: P({ enabled: false }), sentToday: 999, now: NOON, withinWindow: () => false });
  check(/paused across Cortex/i.test(both.note || ""),
    "the kill switch outranks the workspace switch, quiet hours and the daily cap",
    `a workspace that is also off and over its limit must still report the platform pause — got "${both.note}"`);

  /* Fails OPEN: unreadable switch is passed as true by the caller. */
  const open = runGate({ platformEnabled: true, policy: P(), sentToday: 0, now: NOON, withinWindow: alwaysOpen });
  check(open.allowed === true,
    "an unreadable switch does not halt everyone — the caller passes true and sending continues");
}

/* ===================================================== the workspace switch */
{
  const g = runGate({ platformEnabled: true, policy: P({ enabled: false }), sentToday: 0, now: NOON, withinWindow: alwaysOpen });
  check(g.allowed === false && /switched off/i.test(g.note || ""),
    "collections off means nothing sends");
}

/* ============================================================= quiet hours */
{
  const night = new Date("2026-09-17T18:00:00Z"); // 23:30 IST
  const g = runGate({ platformEnabled: true, policy: P(), sentToday: 0, now: night, withinWindow: realWindow });
  check(g.allowed === false && /sending window/i.test(g.note || ""),
    "nothing goes out at 23:30 IST with a 9–19 window",
    "a dunning message at midnight is the kind of thing that loses a customer their customer");

  const day = runGate({ platformEnabled: true, policy: P(), sentToday: 0, now: NOON, withinWindow: realWindow });
  check(day.allowed === true, "…and 11:00 IST is fine");

  /* The overnight window that once disabled sending forever. */
  const wrap = runGate({ platformEnabled: true, policy: P({ send_from_hour: 19, send_to_hour: 9 }), sentToday: 0, now: night, withinWindow: realWindow });
  check(wrap.allowed === true, "a wrapping 19–9 window is read as wrapping, not as never");
}

/* ============================================================= daily limit */
{
  const at = runGate({ platformEnabled: true, policy: P({ max_per_day: 25 }), sentToday: 25, now: NOON, withinWindow: alwaysOpen });
  check(at.allowed === false && /Daily limit of 25/.test(at.note || ""),
    "the daily ceiling stops the run once reached");

  const near = runGate({ platformEnabled: true, policy: P({ max_per_day: 25 }), sentToday: 23, now: NOON, withinWindow: alwaysOpen });
  check(near.allowed === true && near.room === 2,
    "…and room is exactly what is left, so a run cannot overshoot it",
    `expected 2, got ${near.room}`);

  const over = runGate({ platformEnabled: true, policy: P({ max_per_day: 25 }), sentToday: 40, now: NOON, withinWindow: alwaysOpen });
  check(over.room === 0, "an over-count from a previous bug cannot produce negative room", `got ${over.room}`);
}

/* ================================================== paid — before and after */
{
  const paid = decide({ thread: { status: "recovered" } });
  check(paid.action === "cancel" && /paid/i.test(paid.reason),
    "a thread marked recovered is never chased",
    "chasing someone who has paid is the single worst thing this feature can do");

  /* Paid AFTER the draft was approved: the queue row still exists and is
     re-checked at send time, which is the whole reason the check is here. */
  const late = decideMessage({
    policy: P(), thread: thread({ status: "recovered", attempts: 1, last_sent_at: "2026-09-01T06:00:00Z" }),
    message: msg(), now: NOON, normalise: normalizeCustomerName,
  });
  check(late.action === "cancel" && /paid/i.test(late.reason),
    "an invoice paid after its reminder was approved is still not sent",
    "the queue outlives the state it was checked against at draft time");

  check(decide({ thread: { status: "excluded" } }).action === "cancel",
    "an excluded thread is never chased");
}

/* =========================================================== attempts cap */
{
  check(decide({ thread: { attempts: 3 }, policy: { max_attempts: 3 } }).action === "cancel",
    "the attempt cap holds at the limit");
  check(decide({ thread: { attempts: 4 }, policy: { max_attempts: 3 } }).action === "cancel",
    "…and beyond it");
  check(decide({ thread: { attempts: 2 }, policy: { max_attempts: 3 } }).action === "send",
    "…but one below the cap still sends");
}

/* ======================================================== do-not-contact */
{
  /* Matched on the NORMALISED name, so the owner does not have to type the
     registered suffix exactly as it appears on the invoice. */
  for (const entry of ["Kirloskar Distributors", "kirloskar distributors", "Kirloskar Distributors Pvt Ltd", "KIRLOSKAR  DISTRIBUTORS"]) {
    const d = decide({ policy: { do_not_contact: [entry] } });
    check(d.action === "cancel" && /do-not-contact/i.test(d.reason),
      `do-not-contact entry "${entry}" stops the message`,
      "this is the \"I told it not to contact them and it did\" incident");
  }
  check(decide({ policy: { do_not_contact: ["Deccan Spares"] } }).action === "send",
    "a different party on the list does not block this one");
}

/* ================================================================ min gap */
{
  const twoDaysAgo = new Date(NOON.getTime() - 2 * 86_400_000).toISOString();
  const tenDaysAgo = new Date(NOON.getTime() - 10 * 86_400_000).toISOString();
  check(decide({ thread: { last_sent_at: twoDaysAgo }, policy: { min_gap_days: 7 } }).action === "cancel",
    "a reminder two days after the last one is refused with a 7-day gap");
  check(decide({ thread: { last_sent_at: tenDaysAgo }, policy: { min_gap_days: 7 } }).action === "send",
    "…and ten days later is allowed");
}

/* ======================================================== no recipient */
{
  const d = decide({ message: { recipient: null } });
  check(d.action === "cancel" && /recipient/i.test(d.reason),
    "a message with nowhere to go is refused, with the reason recorded");
  check(decide({ message: { recipient: "   " } }).action === "cancel",
    "…and whitespace is not an address");
}

/* ============================================ unconfigured channel = skip */
{
  const d = decide({ message: { channel: "whatsapp" }, channelReady: false, channelNotReadyReason: "WhatsApp is not connected" });
  check(d.action === "skip",
    "an unconfigured channel is SKIPPED, not failed",
    "counting it as a failure trips the breaker and switches off the email that works");
  check(/not connected/i.test(d.reason), "…with the reason the owner needs to act on");
}

/* ================================================= the breaker, and what it ignores */
{
  check(shouldTripBreaker({ sent: 0, failed: 5, skipped: 0 }) === true,
    "five failures and no sends trips the breaker — an expired token should not be rediscovered every run");
  check(shouldTripBreaker({ sent: 1, failed: 5, skipped: 0 }) === false,
    "one success means the credentials work; an occasional bounce must not switch the workspace off");
  check(shouldTripBreaker({ sent: 0, failed: 0, skipped: 10 }) === false,
    "ten skips and no sends does NOT trip it",
    "\"you have not connected WhatsApp\" is not fixed by stopping email too");
  check(shouldTripBreaker({ sent: 0, failed: 0, skipped: 0 }) === false,
    "an empty run trips nothing");
}

/* ===================== ordering: paid beats everything that follows it ==== */
{
  const all = decideMessage({
    policy: P({ max_attempts: 1, min_gap_days: 30, do_not_contact: ["Kirloskar Distributors"] }),
    thread: thread({ status: "recovered", attempts: 9, last_sent_at: NOON.toISOString() }),
    message: msg(), now: NOON, normalise: normalizeCustomerName,
  });
  check(/paid/i.test(all.reason),
    "when several refusals apply at once, the reported reason is that it was paid",
    `the owner must be told the money arrived, not that the gap was too short — got "${all.reason}"`);
}

/* ================= stop-on-payment, against real Postgres ================= */
/*
  The trigger is the mechanism, so it is tested as one. This is the scenario
  the whole feature turns on: money lands while a reminder is sitting approved
  in the queue.
*/
{
  const db = new PGlite();
  const sql = readFileSync("supabase/migrations/2026_collections.sql", "utf8");

  await db.exec(`
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create table invoices (
      id uuid primary key default gen_random_uuid(), org_id uuid, party text,
      amount numeric, type text, status text, issue_date date, due_date date,
      created_at timestamptz default now());
  `);

  /* Only the pieces this trigger touches — the rest of the migration needs
     tables this fixture has no reason to build. */
  const grab = (name) => {
    const i = sql.indexOf(`create table if not exists ${name}`);
    if (i < 0) return "";
    return sql.slice(i, sql.indexOf(");", i) + 2);
  };
  await db.exec(grab("collection_threads"));
  await db.exec(grab("collection_messages"));

  const fnStart = sql.indexOf("create or replace function cortex_collections_stop_on_paid");
  const fnEnd = sql.indexOf("$$;", fnStart) + 3;
  await db.exec(sql.slice(fnStart, fnEnd));
  const trgStart = sql.indexOf("drop trigger if exists cortex_invoice_paid_stops_collection");
  await db.exec(sql.slice(trgStart, sql.indexOf(";", sql.indexOf("create trigger", trgStart)) + 1));

  const org = (await db.query("insert into organizations (name) values ('Fixture') returning id")).rows[0].id;
  const inv = (await db.query(
    `insert into invoices (org_id, party, amount, type, status, due_date)
     values ($1,'Kirloskar Distributors', 366100, 'receivable', 'pending', current_date - 60) returning id`, [org])).rows[0].id;
  const th = (await db.query(
    `insert into collection_threads (org_id, invoice_id, party, amount, status, attempts)
     values ($1,$2,'Kirloskar Distributors', 366100, 'open', 1) returning id`, [org, inv])).rows[0].id;
  await db.query(
    `insert into collection_messages (org_id, thread_id, channel, recipient, subject, body, status)
     values ($1,$2,'email','ap@k.example','Payment reminder','...', 'approved')`, [org, th]);
  await db.query(
    `insert into collection_messages (org_id, thread_id, channel, recipient, subject, body, status)
     values ($1,$2,'email','ap@k.example','Payment reminder','...', 'draft')`, [org, th]);

  const statuses = async () =>
    (await db.query("select status from collection_messages where thread_id = $1 order by status", [th])).rows.map((r) => r.status);
  const threadStatus = async () =>
    (await db.query("select status, recovered_amount from collection_threads where id = $1", [th])).rows[0];

  check((await statuses()).join(",") === "approved,draft", "fixture: one approved and one draft reminder are queued");

  /* The money arrives. */
  await db.query("update invoices set status = 'paid' where id = $1", [inv]);

  const after = await statuses();
  check(after.every((s) => s === "cancelled"),
    "paying the invoice cancels BOTH the approved and the drafted reminder",
    `got ${JSON.stringify(after)} — an approved message left in the queue is one that gets sent to someone who has paid`);

  const t = await threadStatus();
  check(t.status === "recovered", "…and the thread is closed as recovered", `got ${t.status}`);
  check(Number(t.recovered_amount) === 366100,
    "the recovery is credited, because a reminder had actually been sent",
    `got ${t.recovered_amount}`);

  /* Idempotency: the same update again must not double-count or reopen. */
  await db.query("update invoices set status = 'paid' where id = $1", [inv]);
  const t2 = await threadStatus();
  check(t2.status === "recovered" && Number(t2.recovered_amount) === 366100,
    "a repeated paid update — a duplicated webhook — changes nothing",
    `got ${t2.status} / ${t2.recovered_amount}`);

  /* A thread with no attempts must not be credited with the recovery. */
  const inv2 = (await db.query(
    `insert into invoices (org_id, party, amount, type, status, due_date)
     values ($1,'Deccan Spares', 100000, 'receivable', 'pending', current_date - 60) returning id`, [org])).rows[0].id;
  const th2 = (await db.query(
    `insert into collection_threads (org_id, invoice_id, party, amount, status, attempts)
     values ($1,$2,'Deccan Spares', 100000, 'open', 0) returning id`, [org, inv2])).rows[0].id;
  await db.query("update invoices set status = 'paid' where id = $1", [inv2]);
  const t3 = (await db.query("select status, recovered_amount from collection_threads where id = $1", [th2])).rows[0];
  check(t3.status === "recovered" && t3.recovered_amount === null,
    "money that arrived before Cortex said anything is NOT counted as recovered value",
    `got ${t3.recovered_amount} — claiming credit for it would be lying about our own worth`);

  await db.close();
}

/* ========================= the engine really uses these rules ============= */
{
  const engine = readFileSync("src/lib/collections/index.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(/from "\.\/rules"/.test(engine), "sendApproved imports the decision module");
  check(/runGate\(\{/.test(engine), "…uses runGate for the run-level checks");
  check(/decideMessage\(\{/.test(engine), "…and decideMessage per message");
  check(/shouldTripBreaker\(\{/.test(engine), "…and shouldTripBreaker for the breaker");
  check(!/let refuse: string \| null = null;/.test(engine),
    "the old inline refusal ladder is gone, so there is only one copy of these rules");
}

console.log(`\ncollections engine: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Kill switch, quiet hours, daily cap, paid, attempts, do-not-contact, gap, skips and the breaker all run — and paying an invoice cancels its queued reminders in real Postgres.");
