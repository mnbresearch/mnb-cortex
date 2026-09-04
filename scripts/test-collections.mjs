/**
 * The collections agent — the module where a bug costs a relationship.
 *
 * Everything else in Cortex is read-only or writes to the customer's own
 * workspace. This one sends messages, in the customer's name, to THEIR
 * customers. The failure modes are not a wrong number on a dashboard; they are
 * a valued client dunned twice in a day, a reminder to someone who already
 * paid, or a threat of legal action nobody authorised.
 *
 * So this test is written adversarially. It does not check that the happy path
 * works — it checks that every way of causing harm is refused:
 *
 *   - can a paid invoice still be chased?
 *   - can the same reminder go out twice?
 *   - can a message contain a legal threat, via the owner's own signature?
 *   - can a draft be sent without approval?
 *   - can escalation invent leverage that was never agreed?
 *   - does the recovery number count money Cortex had nothing to do with?
 */

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

/* Load the real drafting module. */
const draftSrc = readFileSync("src/lib/collections/draft.ts", "utf8");
const js = ts.transpileModule(draftSrc, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
new Function("exports", "require", js)(mod, () => ({}));
const { draftReminder, containsForbidden, FORBIDDEN } = mod;

check(typeof draftReminder === "function", "parse: loaded the drafting module");
check(Array.isArray(FORBIDDEN) && FORBIDDEN.length > 10,
  "parse: loaded the forbidden-phrase list", `${FORBIDDEN?.length} phrases`);

/* ------------------------------------------- what Cortex will never say */

const base = {
  party: "Sharma Traders", invoiceNo: "INV-0042", amount: 800000,
  dueDate: "2026-07-01", daysPastDue: 62, businessName: "Acme Steel",
  channel: "email",
};

/*
  Every attempt at every tone. A threat that only appears at attempt 3 with tone
  "firm" is exactly the combination nobody checks by hand.
*/
for (const attempt of [1, 2, 3, 4, 99]) {
  for (const tone of ["polite", "neutral", "firm"]) {
    for (const channel of ["email", "whatsapp"]) {
      const d = draftReminder({ ...base, attempt, tone, channel });
      const hit = containsForbidden(`${d.subject || ""} ${d.body}`);
      check(hit === null,
        `no threat at attempt ${attempt}, tone ${tone}, ${channel}`,
        `contains "${hit}"`);
    }
  }
}

/*
  The owner's own free text is the real risk: the templates cannot produce a
  threat, but a signature can, and it is appended to every message.
*/
const withThreat = draftReminder({
  ...base, attempt: 1, tone: "polite",
  signature: "Acme Steel — pay in 3 days or we will take legal action",
});
check(containsForbidden(withThreat.body) !== null,
  "a threat typed into the SIGNATURE is detected",
  "the owner's own words would go out under Cortex's name unchecked");

const withPaymentThreat = draftReminder({
  ...base, attempt: 1, tone: "firm",
  paymentNote: "UPI acme@hdfc. Late fee will be charged after this.",
});
check(containsForbidden(withPaymentThreat.body) !== null,
  "a penalty threatened in the PAYMENT NOTE is detected");

/* Escalation must change directness, not leverage. */
const a1 = draftReminder({ ...base, attempt: 1, tone: "polite" }).body;
const a3 = draftReminder({ ...base, attempt: 3, tone: "firm" }).body;
check(a1 !== a3, "the third reminder differs from the first");
check(/confirm a date/i.test(a3), "the final reminder asks for a DATE", a3);
check(!/legal|court|penalt|interest/i.test(a3),
  "…and still contains no invented leverage", a3);
check(/apolog/i.test(a1), "the first reminder assumes it was simply missed", a1);

/* Attempt is clamped: a caller losing count cannot escalate past the ladder. */
const a99 = draftReminder({ ...base, attempt: 99, tone: "firm" }).body;
check(a99 === a3, "attempt 99 produces the same message as attempt 3",
  "an off-by-one in the caller must not produce a harsher message than exists");

/* Useful things must survive. */
const d1 = draftReminder({ ...base, attempt: 2, tone: "neutral", paymentNote: "UPI: acme@hdfc" });
check(d1.body.includes("₹8,00,000"), "the amount is stated, in Indian format", d1.body);
check(d1.body.includes("INV-0042"), "the invoice number is stated");
check(d1.body.includes("62 day"), "the days overdue are stated");
check(d1.body.includes("UPI: acme@hdfc"), "payment details are included — a reminder without them is nagging");
check(d1.subject !== null, "email drafts have a subject");
check(draftReminder({ ...base, channel: "whatsapp" }).subject === null,
  "WhatsApp drafts have no subject");

/* ------------------------------------------------ the database guarantees */

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
  ok(); // migration applies

  const org = (await db.query(`insert into organizations (name) values ('Acme') returning id`)).rows[0].id;
  const inv = (await db.query(
    `insert into invoices (org_id, invoice_no, party, amount, due_date, type)
     values ($1,'INV-1','Sharma Traders',800000,current_date - 60,'receivable') returning id`, [org])).rows[0].id;

  const thread = (await db.query(
    `insert into collection_threads (org_id, invoice_id, party, amount, attempts)
     values ($1,$2,'Sharma Traders',800000,2) returning id`, [org, inv])).rows[0].id;
  await db.query(
    `insert into collection_messages (org_id, thread_id, channel, body, status)
     values ($1,$2,'email','sent one','sent'),
            ($1,$2,'email','draft one','draft'),
            ($1,$2,'email','approved one','approved')`, [org, thread]);

  /* ---- THE ONE THAT MATTERS: paying stops everything, immediately ---- */

  await db.query(`update invoices set status = 'paid' where id = $1`, [inv]);

  const t = (await db.query(`select status, recovered_amount, recovered_at from collection_threads where id=$1`, [thread])).rows[0];
  check(t.status === "recovered",
    "marking the invoice paid closes the thread AT ONCE",
    `status is "${t.status}" — a paid customer would keep being chased`);
  check(Number(t.recovered_amount) === 800000, "…and records what was recovered", `${t.recovered_amount}`);
  check(t.recovered_at !== null, "…with the date");

  const leftover = (await db.query(
    `select count(*)::int n from collection_messages
      where thread_id=$1 and status in ('draft','approved')`, [thread])).rows[0].n;
  check(Number(leftover) === 0,
    "every unsent message is cancelled the moment the invoice is paid",
    `${leftover} message(s) would still have gone out to someone who has already paid`);

  const stillSent = (await db.query(
    `select count(*)::int n from collection_messages where thread_id=$1 and status='sent'`, [thread])).rows[0].n;
  check(Number(stillSent) === 1, "…but what was already sent is not rewritten — the log stays honest");

  /* ---- recovery must not claim money Cortex had nothing to do with ---- */

  const inv2 = (await db.query(
    `insert into invoices (org_id, invoice_no, party, amount, due_date, type)
     values ($1,'INV-2','Never Chased',500000,current_date - 10,'receivable') returning id`, [org])).rows[0].id;
  await db.query(
    `insert into collection_threads (org_id, invoice_id, party, amount, attempts)
     values ($1,$2,'Never Chased',500000,0)`, [org, inv2]);
  await db.query(`update invoices set status='paid' where id=$1`, [inv2]);

  const claimed = (await db.query(
    `select recovered_amount from collection_threads where invoice_id=$1`, [inv2])).rows[0].recovered_amount;
  check(claimed === null,
    "an invoice paid WITHOUT any reminder is not counted as recovered",
    `claimed ₹${claimed} — the Prove number would be taking credit for money that would have arrived anyway`);

  const summary = (await db.query(`select * from cortex_recovery_summary($1, 90)`, [org])).rows[0];
  check(Number(summary.amount_recovered) === 800000,
    "the recovery summary counts only genuinely recovered money",
    `₹${summary.amount_recovered} — should be ₹8,00,000, not ₹13,00,000`);
  check(Number(summary.invoices_recovered) === 1, "…and one invoice, not two");

  /* ---- one thread per invoice, so two runs cannot double-chase ---- */

  let dup = null;
  try {
    await db.query(
      `insert into collection_threads (org_id, invoice_id, party, amount) values ($1,$2,'Sharma Traders',800000)`,
      [org, inv]);
  } catch (e) { dup = String(e.message || e); }
  check(dup !== null,
    "an invoice cannot have two chase threads",
    "two parallel conversations with the same person about the same money");

  /* ---- policy defaults are the SAFE ones ---- */

  await db.query(`insert into collection_policies (org_id) values ($1)`, [org]);
  const p = (await db.query(`select * from collection_policies where org_id=$1`, [org])).rows[0];
  check(p.enabled === false, "collections is OFF by default",
    "a workspace that never asked for it would start messaging its customers");
  check(p.auto_send === false, "auto-send is OFF by default",
    "the human must be in the loop unless removed deliberately");
  check(p.tone === "polite", "the default tone is polite");
  check(p.max_attempts <= 5, "the default attempt cap is low", `${p.max_attempts}`);
  check(p.send_from_hour >= 7 && p.send_to_hour <= 21,
    "the default sending window is daytime", `${p.send_from_hour}–${p.send_to_hour}`);

  /* Harsher-than-firm must be impossible to store. */
  let badTone = null;
  try { await db.query(`update collection_policies set tone='aggressive' where org_id=$1`, [org]); }
  catch (e) { badTone = String(e.message || e); }
  check(badTone !== null, "a tone harsher than 'firm' cannot be saved");

  /* Only the three known statuses. */
  let badStatus = null;
  try {
    await db.query(`insert into collection_messages (org_id, thread_id, channel, body, status)
                    values ($1,$2,'email','x','delivered')`, [org, thread]);
  } catch (e) { badStatus = String(e.message || e); }
  check(badStatus !== null, "an unknown message status is rejected");

  /* ---- approval is a real gate, in the engine ---- */
  const engine = readFileSync("src/lib/collections/index.ts", "utf8");
  check(/\.eq\("status", "approved"\)/.test(engine),
    "the sender only ever selects APPROVED messages",
    "a draft could be sent, which makes the approval step decorative");
  check(/\.eq\("id", m\.id\)\.eq\("status", "approved"\)/.test(engine),
    "…and claims each one before sending, so two cron runs cannot both deliver it");
  check(/auto_send: false/.test(engine), "the engine's default policy has auto_send off");
  check(/withinQuietHours/.test(engine), "quiet hours are enforced before sending");

  const actions = readFileSync("src/lib/actions.ts", "utf8");
  check(/\.eq\("status", "draft"\)/.test(actions),
    "approving only works on a DRAFT",
    "re-submitting the form could reset a sent message back to approved and send it twice");

  console.log(`\ncollections: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log("  paid stops the chase, no threats at any tone, recovery counts only what it earned.");
}

main().catch((e) => { console.error(e); process.exit(1); });
