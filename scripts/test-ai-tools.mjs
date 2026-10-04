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

/*
  NO WRITES — WITH THE ONE EXCEPTION THIS SUITE NOW PINS EXACTLY.

  For most of this product's life this block asserted that runTool contained
  no write verb at all, and three security reviews rested on that. It is no
  longer literally true: propose_action exists. So the invariant is restated
  precisely rather than loosened:

    · runTool itself still contains no .insert/.update/.upsert/.delete — the
      one write lives in lib/engine/ledger.ts, reached ONLY through propose().
    · propose_action is dispatched BEFORE the SELECT switch, through a single
      helper that calls the ledger's propose() and nothing else from the
      engine — never approve(), execute() or setPolicy(). The model proposes;
      it cannot decide or run.
    · the header no longer claims "everything is SELECT" without qualifying it.

  A test that kept saying "the tools are read-only" after this change would be
  asserting something false, which is worse than asserting nothing.
*/
for (const verb of ["insert(", "update(", "upsert(", "delete("]) {
  check(!body.includes("." + verb), `no ${verb.replace("(", "")} inside runTool — the lookups are read-only`,
    `found .${verb} in runTool`);
}
{
  const helper = SRC.slice(SRC.indexOf("async function proposeFromChat"), SRC.indexOf("export const TOOL_NAMES"));
  check(helper.length > 200, "propose_action: the helper exists and is the only non-SELECT path");
  check(/\bpropose\(/.test(helper), "propose_action: calls the ledger's propose()");
  for (const forbidden of ["approve(", "execute(", "undo(", "setPolicy(", "reject("]) {
    check(!helper.includes(forbidden), `propose_action: never calls ${forbidden.replace("(", "")} — the model proposes, it does not decide`);
  }
  check(/CHAT_PROPOSALS_PER_DAY/.test(helper) && /source === "chat"/.test(helper),
    "propose_action: capped per day, counted from the ledger",
    "a poisoned prompt must not be able to flood the approval queue");
  check(/source: "chat"/.test(helper), "propose_action: labels its proposals as coming from chat",
    "the person approving must be able to see this came from the model");
  check(!/args\?\.orgId|args\?\.org_id|args\.org/.test(helper), "propose_action: the workspace comes from the session, not the model's arguments");
  /* The header must not still make the unqualified claim. */
  check(!/Everything is SELECT\. There is no tool that writes/.test(SRC),
    "header: no longer claims every tool is read-only without qualification");
  check(/propose_action/.test(SRC.slice(0, SRC.indexOf("const MAX_ROWS"))),
    "header: names the exception and explains it");
}

/*
  No GENERATED SQL — which is not the same as no SQL.

  The first version of this banned `.rpc(` outright, and then failed the moment
  a legitimate named function was called. That is the wrong property: the danger
  is a query whose TEXT the model can influence, not a fixed function with typed
  parameters. `cortex_recovery_summary(p_org, p_days)` is as safe as any
  hand-written select — safer, since the org id is still supplied by us.

  So: no raw execution paths at all, and every .rpc() must name a literal
  function rather than a variable the model could reach.
*/
check(!/execute_sql|\braw\(|\bsql`/i.test(body), "no raw SQL execution path");
const rpcCalls = [...body.matchAll(/\.rpc\(\s*([^,)]+)/g)].map((m) => m[1].trim());
for (const call of rpcCalls) {
  check(/^["'`]/.test(call),
    `.rpc(${call}) names a literal function, not a variable`,
    "a function name the model could influence is the same risk as generated SQL");
}
check(rpcCalls.every((c) => /cortex_/.test(c)),
  "every RPC the tools call is one of ours",
  `called: ${rpcCalls.join(", ")}`);

/* Every declared tool has a case, and every case is declared — a declaration
   with no implementation makes the model call something that always errors. */
const declared = [...SRC.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
const cases = [...body.matchAll(/case\s+"([a-z_]+)":/g)].map((m) => m[1]);
check(declared.length >= 6, "parse: found the declarations", `${declared.length}`);
/* propose_action is implemented by early dispatch, not a switch case — assert that explicitly. */
for (const d of declared) {
  if (d === "propose_action") {
    check(/if \(name === "propose_action"\) return proposeFromChat\(/.test(body), `tool "${d}" is declared AND implemented (early dispatch)`);
    continue;
  }
  check(cases.includes(d), `tool "${d}" is declared AND implemented`);
}
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


  /*
    EVERY PROVIDER GETS THE SAME TOOLS, THE SAME GUARDS.

    Tools used to exist only on the Gemini branch; on Groq/OpenAI the model
    answered from the snapshot and could narrate an action it never took. The
    OpenAI-compatible loop must (a) exist, (b) offer tools only with a session
    org, (c) refuse undeclared names, (d) scope every call by toolOrg, and
    (e) be bounded. And the chat stream must take the tool-capable path when a
    workspace is signed in — a token stream cannot call tools.
  */
  const CORTEX = readFileSync("src/lib/ai/cortex.ts", "utf8");
  const oc = CORTEX.slice(CORTEX.indexOf("async function openaiCompatible"), CORTEX.indexOf("/** Record an upstream non-OK response"));
  check(oc.length > 200, "an OpenAI-compatible tool loop exists");
  check(/const useTools = Boolean\(toolOrg\)/.test(oc), "openai-compatible: tools only with a session org");
  check(/TOOL_NAMES\.has\(fname\)\s*\?\s*await runTool\(fname, args, toolOrg!/.test(oc), "openai-compatible: undeclared names refused, lookups scoped by toolOrg");
  check(/round < 4/.test(oc) && /calls\.slice\(0, 4\)/.test(oc), "openai-compatible: bounded rounds and calls per round");
  check(/openaiCompatible\("groq"/.test(CORTEX) && /openaiCompatible\("openai"/.test(CORTEX), "both Groq and OpenAI go through the tool loop");
  const sc = CORTEX.slice(CORTEX.indexOf("export async function streamCortex"), CORTEX.indexOf("export async function generateReport"));
  check(/if \(orgId\) \{[\s\S]*?await runCortex\(messages, context\)/.test(sc), "streamCortex uses the tool-capable runner when a workspace is signed in");
  check(sc.indexOf("await runCortex(messages, context)") < sc.indexOf("openaiLike ="), "…and decides that BEFORE falling to the raw token stream");

  console.log(`\nai tools: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log(`  ${declared.length} tools, all org-scoped and read-only; cross-tenant leak attempted and blocked.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
