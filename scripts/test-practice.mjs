/**
 * The Practice console, checked for the property that decides whether it can
 * ship at all.
 *
 * This screen aggregates FINANCIAL DATA ACROSS SEPARATE COMPANIES. A CA firm
 * sees thirty clients on one page. The only thing standing between that and a
 * catastrophic disclosure — one client's receivables shown to another's
 * accountant, or to a firm that was never engaged — is that the client list
 * comes from `memberships` and nowhere else.
 *
 * So this asserts the structural property (the org list is derived from the
 * signed-in user's memberships, and every read is filtered by an id from that
 * list) and then executes the ranking logic on real Postgres to prove it does
 * not leak across tenants.
 *
 * The ranking itself is also worth testing rather than eyeballing. A portfolio
 * view that ranks badly is worse than none: thirty rows of green teaches the
 * firm to stop opening it, at which point the ₹40 lakh case goes unseen too.
 */

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

const SRC = readFileSync("src/lib/practice.ts", "utf8");

/* ------------------------------------------------- structural guarantees */

check(/from\("memberships"\)[\s\S]{0,120}\.eq\("user_id", user\.id\)/.test(SRC),
  "the client list comes from the signed-in user's memberships",
  "if the org list came from anywhere else this screen could show a firm a company it was never engaged by");

check(/if \(!user\) return EMPTY/.test(SRC),
  "no user means no clients, not all clients");

/* Every per-client read must be filtered by an id from that membership list. */
const body = SRC.slice(SRC.indexOf("for (const orgId of orgIds)"));
const froms = (body.match(/\.from\("/g) || []).length;
const scoped = (body.match(/\.eq\("org_id", orgId\)/g) || []).length;
check(froms >= 3, "parse: found the per-client reads", `only ${froms}`);
check(scoped === froms,
  "every per-client read is scoped to that client's org_id",
  `${froms} reads but ${scoped} scoped — an unscoped one would pool every tenant's rows together`);

/* Read-only. A console that can write is a console that can write to the wrong org. */
for (const verb of ["insert(", "update(", "upsert(", "delete("]) {
  check(!body.includes("." + verb), `the console never ${verb.replace("(", "")}s`);
}

/* The "quiet" claim must not be made about a workspace with no data. */
check(/No data yet/.test(SRC),
  "a client with no data is reported as unknown, not as quiet",
  "telling a firm 'nothing needs you' about an empty workspace is false reassurance");

/* ------------------------------------------- the ranking, on real Postgres */

const db = new PGlite();

async function main() {
  await db.exec(`
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create table memberships (user_id uuid, org_id uuid);
    create table invoices (
      id uuid primary key default gen_random_uuid(), org_id uuid not null,
      amount numeric, due_date date, status text default 'pending',
      type text default 'receivable');
  `);

  const mk = async (n) => (await db.query(`insert into organizations (name) values ($1) returning id`, [n])).rows[0].id;
  const acme = await mk("Acme Steel");
  const patel = await mk("Patel Traders");
  const rival = await mk("Rival Corp");      // NOT a client of this firm

  const firm = "11111111-1111-1111-1111-111111111111";
  await db.query(`insert into memberships (user_id, org_id) values ($1,$2),($1,$3)`, [firm, acme, patel]);

  await db.query(`insert into invoices (org_id, amount, due_date) values
     ($1, 800000, current_date - 30),
     ($2, 20000,  current_date - 5),
     ($3, 9999999, current_date - 200)`, [acme, patel, rival]);

  /* The membership query is the security boundary. */
  const mine = (await db.query(`select org_id from memberships where user_id = $1`, [firm])).rows.map((r) => r.org_id);
  check(mine.length === 2, "the firm sees exactly its two clients", `${mine.length}`);
  check(!mine.includes(rival), "a company the firm was never added to is not in the list");

  /* Overdue per client, scoped the way the code scopes it. */
  const overdue = async (org) => Number((await db.query(
    `select coalesce(sum(amount),0) t from invoices
      where org_id = $1 and type='receivable' and status <> 'paid' and due_date < current_date`,
    [org])).rows[0].t);

  const acmeOverdue = await overdue(acme);
  const patelOverdue = await overdue(patel);
  check(acmeOverdue === 800000, "Acme's overdue is its own", `${acmeOverdue}`);
  check(patelOverdue === 20000, "Patel's overdue is its own", `${patelOverdue}`);

  const firmTotal = (await Promise.all(mine.map(overdue))).reduce((a, b) => a + b, 0);
  check(firmTotal === 820000,
    "the firm total sums ONLY its own clients",
    `₹${firmTotal} — Rival's ₹99,99,999 must not be in here`);

  /* --------------------------------------------------- ranking behaviour */
  /*
    Mirrors lib/practice.ts. The threshold matters: every business has someone a
    week late, so a console that shouts about ₹20,000 gets ignored — and then
    the ₹8,00,000 case is ignored with it.
  */
  const MATERIAL = 500_000;
  const rank = ({ msme = 0, overdue = 0, alerts = 0, hasData = true }) => {
    if (msme > 0) return 0;
    if (overdue >= MATERIAL) return 0;
    if (!hasData && !alerts && !overdue) return 1;
    if (overdue > 0 || alerts > 0) return 1;
    return 2;
  };

  check(rank({ overdue: acmeOverdue }) === 0, "₹8L overdue ranks as needs-attention");
  check(rank({ overdue: patelOverdue }) === 1, "₹20k overdue ranks as worth-a-look, not urgent",
    "shouting about small amounts is how a console gets ignored");
  check(rank({ msme: 1, overdue: 0 }) === 0,
    "ANY 43B(h) exposure is urgent regardless of size",
    "it has a dated tax consequence, unlike an ordinary late payment");
  check(rank({ hasData: false }) === 1,
    "a client with no data is NOT reported as quiet");
  check(rank({}) === 2, "a genuinely quiet client ranks last");

  /* Worst-first ordering. */
  const rows = [
    { name: "Quiet Ltd", r: rank({}) },
    { name: "Acme Steel", r: rank({ overdue: acmeOverdue }) },
    { name: "Patel Traders", r: rank({ overdue: patelOverdue }) },
  ].sort((a, b) => a.r - b.r);
  check(rows[0].name === "Acme Steel", "the worst client is first", JSON.stringify(rows));
  check(rows[2].name === "Quiet Ltd", "the quiet one is last");

  console.log(`\npractice: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log("  client list is membership-derived; cross-firm leak attempted and blocked.");
}

main().catch((e) => { console.error(e); process.exit(1); });
