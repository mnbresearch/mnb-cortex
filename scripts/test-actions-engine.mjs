/*
  THE ACTION ENGINE, EXECUTED.

  This is the first subsystem in Cortex that lets the product DO things rather
  than describe them, and the whole safety argument rests on three claims:

    1. The policy engine never says "auto" when it should not.
    2. The schema refuses an autonomy rule that would let an outbound or money
       action run without a daily limit — even if the application forgot.
    3. Every action the model can name has exactly one deterministic handler,
       and every handler is reachable from the catalogue — no orphans, no
       undocumented verbs.

  All three are EXECUTED here: decide() is called with real inputs, the
  migration is applied to a real Postgres (PGlite) and the constraint is
  attacked, and the catalogue/handler sets are compared by reading both files.
  Reading the policy code and agreeing with it is how the billing-guard column
  gap survived for months.

  Run: node --experimental-strip-types --no-warnings scripts/test-actions-engine.mjs
*/
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => { if (cond) pass++; else fails.push(detail ? `${name}\n      ${detail}` : name); };

const { CATALOGUE, CATALOGUE_BY_KEY, validateArgs } = await import("../src/lib/engine/catalogue.ts");
const { decide, normaliseCaps, requiresCaps, rupeesOf, CAPPED_EFFECTS } = await import("../src/lib/engine/policy.ts");

/* ===================================================================== */
/* 1. THE CATALOGUE IS WELL-FORMED AND MATCHES ITS HANDLERS              */
/* ===================================================================== */
{
  check(CATALOGUE.length >= 5, "catalogue: has entries", `only ${CATALOGUE.length}`);
  const keys = CATALOGUE.map((d) => d.key);
  check(new Set(keys).size === keys.length, "catalogue: keys are unique");

  for (const d of CATALOGUE) {
    check(typeof d.describe({}) === "string", `catalogue: ${d.key}.describe() tolerates empty args`);
    check(["internal_write", "outbound", "money", "export"].includes(d.effect), `catalogue: ${d.key} has a known effect`);
    check(["approve", "auto", "blocked"].includes(d.defaultMode), `catalogue: ${d.key} has a default mode`);
    /* An outbound action can never be reversible — un-sending is not a thing. */
    if (d.effect === "outbound") check(d.reversible === false, `catalogue: ${d.key} (outbound) is marked irreversible`);
    /* Anything that sends or spends must default to approval. */
    if (CAPPED_EFFECTS.has(d.effect)) check(d.defaultMode === "approve", `catalogue: ${d.key} (${d.effect}) defaults to approve`,
      "an action that sends or spends must not run on its own before the owner has set a rule");
  }

  /* Handler parity, from the source of handlers.ts (it is server-only, so cannot be imported here). */
  const handlersSrc = strip(read("src/lib/engine/handlers.ts"));
  /* The declaration carries a type annotation containing "=>", so anchor on " = {" not on the first "=". */
  const m = handlersSrc.match(/export const HANDLERS[\s\S]*?= \{([\s\S]*?)\n\};/);
  check(Boolean(m), "handlers: HANDLERS map is present");
  const handlerKeys = (m?.[1] || "").split("\n").map((l) => l.match(/^\s*([a-z_]+)\s*:/)?.[1]).filter(Boolean);
  const missingHandler = keys.filter((k) => !handlerKeys.includes(k));
  const orphanHandler = handlerKeys.filter((k) => !keys.includes(k));
  check(missingHandler.length === 0, "parity: every catalogue action has a handler", `no handler for: ${missingHandler.join(", ")}`);
  check(orphanHandler.length === 0, "parity: every handler is in the catalogue", `undocumented handlers: ${orphanHandler.join(", ")}`);

  /* Every handler that writes checks its row count. */
  /*
    Each write is one chained statement ending in ";". Take the chain from
    .update(/.delete( to that semicolon and require .select( inside it. The
    first version used a LAZY quantifier after the call, which matched zero
    characters and so never saw the .select() — reporting nine "unchecked"
    writes that were all checked. A guard that cries wolf gets ignored.
  */
  const writes = [];
  for (const m2 of handlersSrc.matchAll(/\.(update|delete)\(/g)) {
    const end = handlersSrc.indexOf(";", m2.index);
    writes.push(handlersSrc.slice(m2.index, end === -1 ? undefined : end));
  }
  check(writes.length >= 6, "handlers: found the writes", `only ${writes.length}`);
  const unchecked = writes.filter((w) => !/\.select\(/.test(w));
  check(unchecked.length === 0, "handlers: every update/delete is followed by .select() so the row count is checked",
    `${unchecked.length} write(s) do not select back — a zero-row update would be reported as done`);

  /* No handler resolves the workspace from the arguments. */
  check(!/args\.org_id|args\.orgId|args\["org_id"\]/.test(handlersSrc), "handlers: never take org_id from the arguments");
  /* The reminder never takes a recipient from the arguments. */
  check(!/args\.(to|recipient|email|phone)\b/.test(handlersSrc), "handlers: the reminder never takes a recipient from the arguments");
}

/* ===================================================================== */
/* 2. ARGUMENT VALIDATION IS STRICT                                      */
/* ===================================================================== */
{
  const due = CATALOGUE_BY_KEY.update_invoice_due_date;
  const good = validateArgs(due, { invoice_id: "11111111-2222-3333-4444-555555555555", due_date: "2026-11-30", extra: "dropped" });
  check(good.ok && !("extra" in good.args), "args: unknown keys are dropped, not passed through");
  check(!validateArgs(due, { invoice_id: "not-a-uuid", due_date: "2026-11-30" }).ok, "args: a non-uuid id is rejected");
  check(!validateArgs(due, { invoice_id: "11111111-2222-3333-4444-555555555555", due_date: "30/11/2026" }).ok, "args: a non-ISO date is rejected");
  check(!validateArgs(due, { due_date: "2026-11-30" }).ok, "args: a missing required field is rejected");

  const ex = CATALOGUE_BY_KEY.export_xlsx;
  check(!validateArgs(ex, { dataset: "all_the_things" }).ok, "args: an enum outside its values is rejected");
  check(validateArgs(ex, { dataset: "receivables_ageing", days: "90" }).ok, "args: a numeric string is accepted as a number");
  check(!validateArgs(ex, { dataset: "receivables_ageing", days: 99999 }).ok, "args: a number above max is rejected");

  const rem = CATALOGUE_BY_KEY.send_payment_reminder;
  check(rupeesOf(rem, { amount: 12500 }) === 12500, "rupeesOf: reads the amount argument for capped actions");
  check(rupeesOf(rem, {}) === null, "rupeesOf: null when no amount is present");
}

/* ===================================================================== */
/* 3. THE POLICY ENGINE — the matrix that matters                        */
/* ===================================================================== */
{
  const rem = CATALOGUE_BY_KEY.send_payment_reminder;   // outbound, needs caps
  const paid = CATALOGUE_BY_KEY.mark_invoice_paid;      // money, needs caps
  const due = CATALOGUE_BY_KEY.update_invoice_due_date; // internal, reversible
  const exp = CATALOGUE_BY_KEY.export_xlsx;             // export, default auto
  const dnc = CATALOGUE_BY_KEY.add_do_not_contact;      // internal, default auto ("do less")
  const noUse = { doneToday: 0 };

  /* Defaults with no rule. */
  check(decide(rem, { amount: 100 }, null, noUse).verdict === "approve", "default: a reminder waits for approval");
  check(decide(paid, { amount: 100 }, null, noUse).verdict === "approve", "default: marking paid waits for approval");
  check(decide(due, {}, null, noUse).verdict === "approve", "default: a due-date change waits for approval");
  check(decide(exp, { dataset: "payables" }, null, noUse).verdict === "auto", "default: an export runs on its own");
  check(decide(dnc, { party: "X" }, null, noUse).verdict === "auto", "default: do-not-contact runs on its own (it only makes Cortex do less)");

  /* Blocked wins over everything, including caps that would otherwise pass. */
  const blockedPol = { mode: "blocked", caps: normaliseCaps({ max_per_day: 99 }) };
  check(decide(exp, { dataset: "payables" }, blockedPol, noUse).verdict === "blocked", "blocked: wins even for an export");
  check(decide(rem, { amount: 1 }, blockedPol, noUse).verdict === "blocked", "blocked: wins for a reminder");

  /* Auto on an outbound action WITHOUT caps must not be honoured. */
  const autoNoCaps = { mode: "auto", caps: normaliseCaps({}) };
  const v1 = decide(rem, { amount: 100 }, autoNoCaps, noUse);
  check(v1.verdict === "approve", "auto-without-caps: an outbound action is downgraded to approve", v1.reason);
  check(/daily limit/i.test(v1.reason), "auto-without-caps: the reason says why", v1.reason);
  check(decide(paid, { amount: 100 }, autoNoCaps, noUse).verdict === "approve", "auto-without-caps: a money action is downgraded to approve");
  /* ...but an internal reversible action may be auto with no caps at all. */
  check(decide(due, {}, autoNoCaps, noUse).verdict === "auto", "auto-without-caps: an internal reversible action may run");

  /* Daily cap, enforced from ledger usage. */
  const five = { mode: "auto", caps: normaliseCaps({ max_per_day: 5 }) };
  check(decide(rem, { amount: 100 }, five, { doneToday: 4 }).verdict === "auto", "daily cap: the 5th of 5 runs");
  const v2 = decide(rem, { amount: 100 }, five, { doneToday: 5 });
  check(v2.verdict === "approve", "daily cap: the 6th of 5 waits", v2.reason);
  check(v2.verdict !== "blocked", "daily cap: exceeding a cap never BLOCKS — the owner can still say yes by hand");

  /* Rupee ceiling. */
  const ceiling = { mode: "auto", caps: normaliseCaps({ max_per_day: 10, max_amount_inr: 50_000 }) };
  check(decide(rem, { amount: 49_999 }, ceiling, noUse).verdict === "auto", "ceiling: below runs");
  check(decide(rem, { amount: 50_000 }, ceiling, noUse).verdict === "auto", "ceiling: exactly at the ceiling runs");
  check(decide(rem, { amount: 50_001 }, ceiling, noUse).verdict === "approve", "ceiling: above waits");
  check(decide(rem, {}, ceiling, noUse).verdict === "approve", "ceiling: a proposal with NO amount waits — a cap cannot be enforced on nothing");

  /* Known parties only. */
  const known = { mode: "auto", caps: normaliseCaps({ max_per_day: 10, known_parties_only: true }) };
  check(decide(rem, { amount: 1 }, known, { doneToday: 0, partyKnown: true }).verdict === "auto", "known-only: a known party runs");
  check(decide(rem, { amount: 1 }, known, { doneToday: 0, partyKnown: false }).verdict === "approve", "known-only: a new party waits");
  check(decide(rem, { amount: 1 }, known, { doneToday: 0 }).verdict === "approve", "known-only: UNKNOWN knowledge is treated as new, not as known");

  /* normaliseCaps never invents a zero. */
  const n = normaliseCaps({ max_per_day: "", max_amount_inr: "abc", known_parties_only: "yes" });
  check(n.max_per_day === null && n.max_amount_inr === null, "normaliseCaps: blanks and garbage become null, not 0");
  check(n.known_parties_only === false, "normaliseCaps: known_parties_only is only true for literal true");
  check(normaliseCaps({ max_per_day: -3 }).max_per_day === null, "normaliseCaps: a negative cap is not a cap");

  check(requiresCaps(rem) && requiresCaps(paid) && !requiresCaps(due) && !requiresCaps(exp), "requiresCaps: outbound and money, not internal or export");
}

/* ===================================================================== */
/* 4. THE SCHEMA, ON REAL POSTGRES                                       */
/* ===================================================================== */
{
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create or replace function user_org_ids() returns setof uuid language sql stable as $$ select id from organizations $$;
  `);
  /*
    MIMIC SUPABASE, OR THE REVOKE IS UNTESTABLE. A fresh Supabase project has
    `alter default privileges … grant all on tables to anon, authenticated`,
    so a new table is browser-writable the moment it exists and the
    migration's revoke is what takes that away. A bare PGlite grants nothing
    by default, so without this line the revoke is a no-op in the test and
    deleting it from the migration passes — which is exactly what happened
    the first time this suite was mutation-checked.
  */
  await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  const sql = read("supabase/migrations/2026_zzzr_actions.sql")
    .replace(/notify pgrst[^;]*;/g, "")                       // no PostgREST here
    .replace(/\/\* -+ verify -+[\s\S]*$/, "");                // drop the trailing report
  let applied = true;
  try { await db.exec(sql); } catch (e) { applied = false; fails.push(`schema: migration failed to apply — ${e.message}`); }
  check(applied, "schema: 2026_zzzr_actions.sql applies cleanly to a real Postgres");

  if (applied) {
    const { rows: [org] } = await db.query(`insert into organizations (name) values ('Acme') returning id`);
    const ORG = org.id;

    /* RLS is on. */
    const rls = await db.query(`select relname, relrowsecurity from pg_class where relname in ('action_proposals','action_policies')`);
    check(rls.rows.length === 2 && rls.rows.every((r) => r.relrowsecurity), "schema: RLS enabled on both tables");

    /* Browser roles cannot write. */
    const grants = await db.query(`
      select grantee, privilege_type from information_schema.role_table_grants
       where table_name in ('action_proposals','action_policies') and grantee in ('anon','authenticated')
         and privilege_type in ('INSERT','UPDATE','DELETE')`);
    check(grants.rows.length === 0, "schema: anon/authenticated hold no INSERT/UPDATE/DELETE on the ledger", JSON.stringify(grants.rows));

    /* THE CONSTRAINT: auto + requires_caps + no daily cap is refused. */
    let refused = false, msg = "";
    try {
      await db.exec(`insert into action_policies (org_id, action, mode, caps, requires_caps)
                     values ('${ORG}', 'send_payment_reminder', 'auto', '{}'::jsonb, true)`);
    } catch (e) { refused = true; msg = e.message; }
    check(refused, "constraint: auto without a daily cap is REFUSED for a capped action", "the row was accepted");
    check(/action_policies_auto_needs_caps/.test(msg), "constraint: refused by the named constraint", msg);

    let refusedZero = false;
    try {
      await db.exec(`insert into action_policies (org_id, action, mode, caps, requires_caps)
                     values ('${ORG}', 'send_payment_reminder', 'auto', '{"max_per_day": 0}'::jsonb, true)`);
    } catch { refusedZero = true; }
    check(refusedZero, "constraint: a daily cap of ZERO does not count as a cap");

    /* ...and is accepted with a cap, and for approve/blocked without one. */
    let okWithCap = true;
    try {
      await db.exec(`insert into action_policies (org_id, action, mode, caps, requires_caps)
                     values ('${ORG}', 'send_payment_reminder', 'auto', '{"max_per_day": 5}'::jsonb, true)`);
    } catch (e) { okWithCap = false; msg = e.message; }
    check(okWithCap, "constraint: auto WITH a daily cap is accepted", msg);
    let okApprove = true;
    try {
      await db.exec(`insert into action_policies (org_id, action, mode, caps, requires_caps)
                     values ('${ORG}', 'mark_invoice_paid', 'approve', '{}'::jsonb, true)`);
    } catch { okApprove = false; }
    check(okApprove, "constraint: approve without caps is fine");
    let okInternal = true;
    try {
      await db.exec(`insert into action_policies (org_id, action, mode, caps, requires_caps)
                     values ('${ORG}', 'update_invoice_due_date', 'auto', '{}'::jsonb, false)`);
    } catch { okInternal = false; }
    check(okInternal, "constraint: auto without caps is fine for a non-capped action");

    /* Idempotency key is unique. */
    await db.exec(`insert into action_proposals (org_id, action, source, idempotency_key) values ('${ORG}', 'raise_alert', 'chat', 'k1')`);
    let dup = false;
    try { await db.exec(`insert into action_proposals (org_id, action, source, idempotency_key) values ('${ORG}', 'raise_alert', 'chat', 'k1')`); } catch { dup = true; }
    check(dup, "schema: a duplicate idempotency_key is refused");

    /* Status is constrained. */
    let badStatus = false;
    try { await db.exec(`insert into action_proposals (org_id, action, source, status, idempotency_key) values ('${ORG}', 'raise_alert', 'chat', 'maybe', 'k2')`); } catch { badStatus = true; }
    check(badStatus, "schema: an unknown status is refused");

    /* The conditional-claim pattern the executor relies on: a second claim touches zero rows. */
    await db.exec(`insert into action_proposals (org_id, action, source, status, idempotency_key) values ('${ORG}', 'raise_alert', 'chat', 'approved', 'k3')`);
    const first = await db.query(`update action_proposals set status = 'executing' where idempotency_key = 'k3' and status = 'approved' returning id`);
    const second = await db.query(`update action_proposals set status = 'executing' where idempotency_key = 'k3' and status = 'approved' returning id`);
    check(first.rows.length === 1 && second.rows.length === 0, "claim: approved→executing wins once and only once");
  }
}

/* ===================================================================== */
/* 5. THE LEDGER CODE CHECKS ROW COUNTS ON ITS CLAIMS                    */
/* ===================================================================== */
{
  const src = strip(read("src/lib/engine/ledger.ts"));
  const claims = [...src.matchAll(/\.update\(\{\s*status: "(executing|approved|rejected)"[\s\S]{0,400}?\.select\(/g)];
  check(claims.length >= 4, "ledger: every status claim selects back the rows", `found ${claims.length}, expected approve, reject, execute-claim, undo-claim`);
  check(/length !== 1/.test(src), "ledger: checks for exactly one claimed row");
  check(/recheckPolicy/.test(src) && /At execution:/.test(src), "ledger: re-evaluates the policy at execution time on the auto path");
  check(/code === "23505"/.test(src), "ledger: a duplicate idempotency key returns the existing proposal rather than erroring");
  /* The chat/server-actions path must resolve the org from the session. */
  const sa = strip(read("src/lib/engine/server-actions.ts"));
  check(!/fd\.get\(["']org_id["']\)/.test(sa) && !/fd\.get\(["']orgId["']\)/.test(sa), "server actions: never read the workspace from the form");
  check((sa.match(/assertRole\(/g) || []).length >= 5, "server actions: every action checks rank");
}

/* ------------------------------------------------------------------ report */
console.log(`\n${fails.length ? "FAIL" : "PASS"}  actions engine: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
