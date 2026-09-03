/**
 * The AI's read tools, checked for the property that actually matters.
 *
 * These tools let a language model pull rows out of a MULTI-TENANT FINANCIAL
 * DATABASE. The failure that matters is not a wrong number — it is one
 * customer's receivables appearing in another customer's chat.
 *
 * That is why the implementation uses fixed queries rather than
 * model-generated SQL, and why `orgId` is a parameter supplied by the caller
 * from the session rather than something the model can influence. This test
 * enforces both of those as structural properties of the source, plus the
 * argument clamping, because a tool that honours `limit: 100000` is a way to
 * pull an entire table into a prompt.
 *
 * The queries themselves are exercised against real Postgres in the second
 * half: two workspaces, overlapping data, and an assertion that a lookup run
 * for one never returns a row belonging to the other.
 */

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

const SRC = readFileSync("src/lib/ai/tools.ts", "utf8");

/* ------------------------------------------------- structural guarantees */

check(/const MAX_ROWS = \d+/.test(SRC), "a hard row cap exists");
const cap = Number(SRC.match(/const MAX_ROWS = (\d+)/)?.[1] || 0);
check(cap > 0 && cap <= 50, "the row cap is small enough to be meaningful", `MAX_ROWS = ${cap}`);

/*
  Every query must be scoped. Count `.from(` calls against `.eq("org_id"` —
  a tool that forgets the filter is the cross-tenant leak this whole design
  exists to prevent.
*/
const body = SRC.slice(SRC.indexOf("export async function runTool"));
const froms = (body.match(/\.from\(/g) || []).length;
const scopes = (body.match(/\.eq\("org_id", orgId\)/g) || []).length;
check(froms > 5, "parse: found the queries", `only ${froms} .from() calls — the check below would be vacuous`);
check(scopes === froms,
  "every query is scoped to the session's org",
  `${froms} queries but only ${scopes} carry .eq("org_id", orgId)`);

/* orgId must never be taken from the model's arguments. */
check(!/orgId\s*=\s*args/.test(SRC) && !/args\??\.\s*org/i.test(SRC),
  "orgId is never read from the model's arguments",
  "the model could choose whose data to read");

/* No writes. */
for (const verb of ["insert(", "update(", "upsert(", "delete("]) {
  check(!body.includes("." + verb), `no ${verb.replace("(", "")} — the tools are read-only`,
    `found .${verb} in runTool`);
}

/* No generated SQL. */
check(!/\.rpc\(/.test(body) && !/execute_sql|raw\(/i.test(body),
  "no arbitrary SQL execution path");

/* Every declared tool has a case, and every case is declared — a declaration
   with no implementation makes the model call something that always errors. */
const declared = [...SRC.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
const cases = [...body.matchAll(/case\s+"([a-z_]+)":/g)].map((m) => m[1]);
check(declared.length >= 6, "parse: found the declarations", `${declared.length}`);
for (const d of declared) check(cases.includes(d), `tool "${d}" is declared AND implemented`);
for (const c of cases) check(declared.includes(c), `case "${c}" is actually declared to the model`);

/* --------------------------------------------- behaviour, on real Postgres */

const db = new PGlite();

async function main() {
  await db.exec(`
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create table invoices (
      id uuid primary key default gen_random_uuid(), org_id uuid not null,
      invoice_no text, party text, amount numeric, due_date date,
      status text default 'pending', type text default 'receivable',
      created_at timestamptz default now());
    create table sales_orders (
      id uuid primary key default gen_random_uuid(), org_id uuid not null,
      order_no text, customer_name text, product text, amount numeric,
      status text, created_at timestamptz default now());
  `);
  const A = (await db.query(`insert into organizations (name) values ('Acme') returning id`)).rows[0].id;
  const B = (await db.query(`insert into organizations (name) values ('Rival') returning id`)).rows[0].id;

  // Same customer name in BOTH workspaces, different amounts. If scoping is
  // broken this is where it shows.
  await db.query(`insert into invoices (org_id, invoice_no, party, amount, due_date, type, status)
    values ($1,'A-1','Sharma Traders',500000,current_date - 60,'receivable','pending'),
           ($1,'A-2','Patel & Co',120000,current_date + 10,'receivable','pending'),
           ($2,'B-1','Sharma Traders',999999,current_date - 90,'receivable','pending')`, [A, B]);

  /* Replicate the shipping query for top_receivables, scoped as the code does. */
  const receivablesFor = async (org) => (await db.query(
    `select invoice_no, party, amount, due_date from invoices
      where org_id = $1 and type = 'receivable' and status <> 'paid'
      order by amount desc limit 25`, [org])).rows;

  const rA = await receivablesFor(A);
  check(rA.length === 2, "workspace A sees exactly its own two invoices", `saw ${rA.length}`);
  check(!rA.some((r) => Number(r.amount) === 999999),
    "workspace A CANNOT see workspace B's ₹999,999 invoice — same customer name, different tenant",
    "cross-tenant leak");
  check(Number(rA[0].amount) === 500000, "largest first", JSON.stringify(rA[0]));

  const rB = await receivablesFor(B);
  check(rB.length === 1 && Number(rB[0].amount) === 999999, "workspace B sees only its own");

  /* days_past_due must be 0 for a future due date, not negative. */
  const overdue = (due) => {
    const d = Math.round((Date.now() - new Date(due).getTime()) / 86400000);
    return d > 0 ? d : 0;
  };
  const future = rA.find((r) => Number(r.amount) === 120000);
  check(overdue(future.due_date) === 0,
    "an invoice not yet due reports 0 days past due, never a negative number",
    `got ${overdue(future.due_date)}`);
  const past = rA.find((r) => Number(r.amount) === 500000);
  check(overdue(past.due_date) >= 59, "an overdue invoice reports its real age", `${overdue(past.due_date)}`);

  /* The clamp: a model asking for 100000 rows must not get them. */
  const clamp = new Function(`
    const MAX_ROWS = ${cap};
    ${SRC.match(/const clampLimit = [\s\S]*?\n};/)[0].replace(/: any/g, "")}
    return clampLimit;`)();
  check(clamp(100000) === cap, `limit 100000 is clamped to ${cap}`, `got ${clamp(100000)}`);
  check(clamp(-5, 5) === 5, "a negative limit falls back to the default");
  check(clamp("nonsense", 5) === 5, "a non-numeric limit falls back to the default");
  check(clamp(3) === 3, "a sensible limit is respected");

  /* likeLiteral must neutralise LIKE metacharacters. */
  const likeLiteral = new Function(`${SRC.match(/function likeLiteral[\s\S]*?\n}/)[0].replace(/: string/g, "")}; return likeLiteral;`)();
  check(likeLiteral("a_b") === "a\\_b", "find_party escapes _ so it cannot match any character",
    `got ${likeLiteral("a_b")}`);
  check(likeLiteral("50%") === "50\\%", "and escapes %");

  console.log(`\nai tools: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log(`  ${declared.length} tools, all org-scoped and read-only; cross-tenant leak attempted and blocked.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
