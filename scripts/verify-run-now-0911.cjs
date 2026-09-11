/*
  supabase/RUN-NOW-2026-09-11.sql, EXECUTED AGAINST REAL POSTGRES BEFORE
  ANYONE PASTES IT INTO PRODUCTION.

  This file is handed to an operator to run by hand on a live database. Two
  things have to be true and neither is provable by reading:

    1. IT PARSES AND APPLIES. A single typo in a `do $$ … $$` block or a
       mis-nested CTE fails halfway, leaving a half-applied schema — which is
       harder to reason about than an unapplied one, because some statements
       have committed and the operator cannot tell which.

    2. THE VERIFY BLOCK CAN ACTUALLY FAIL. It is a 10-row report whose whole
       purpose is to say OK or not. A verify query that returns OK against an
       EMPTY database is worse than no verify query: it manufactures
       confidence. So this runs the report BEFORE applying anything and
       requires it to say MISSING, then applies and requires it to say OK.

  That second check is the point of this script. It is the same class of
  mistake as a test suite whose assertions can never fail.

  Run: node scripts/verify-run-now-0911.cjs
*/
const path = require("path");
const fs = require("fs");
/*
  Derived from this file's own location, not hardcoded. The older
  verify-run-now-sql.cjs pins an absolute sandbox path, which means it runs in
  exactly one place and silently does not exist for anyone who checks the repo
  out — a verification script nobody can run is not verification.
*/
const ROOT = process.env.CORTEX_ROOT || path.resolve(__dirname, "..");
const { PGlite } = require(path.join(ROOT, "node_modules/@electric-sql/pglite"));

const SQL_FILE = path.join(ROOT, "supabase/RUN-NOW-2026-09-11.sql");

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

/* The verify block is the trailing `with checks as (…) select …` statement.
   Split it off so it can be run on its own, against an empty schema. */
function splitFile(sql) {
  const i = sql.indexOf("with checks as (");
  if (i < 0) throw new Error("could not find the verify block in RUN-NOW-2026-09-11.sql");
  return { apply: sql.slice(0, i), verify: sql.slice(i) };
}

(async () => {
  const raw = fs.readFileSync(SQL_FILE, "utf8");
  const { apply, verify } = splitFile(raw);

  const db = new PGlite();

  /* Minimal stubs — just the shape the DDL under test references. `leads` is
     altered, `organizations` is pointed at by two foreign keys. */
  await db.exec(`
    create table organizations (
      id uuid primary key default gen_random_uuid(),
      name text
    );
    create table leads (
      id uuid primary key default gen_random_uuid(),
      name text, email text, phone text, plan text, source text,
      created_at timestamptz not null default now()
    );
  `);

  /* ---- 1. THE VERIFY BLOCK MUST FAIL ON AN UNAPPLIED SCHEMA ------------- */
  {
    const before = await db.query(verify);
    const rows = before.rows;
    check(rows.length === 10, "verify reports exactly 10 checks", `got ${rows.length}`);

    const notOk = rows.filter((r) => r.state !== "OK");
    check(notOk.length === 10, "BEFORE applying: every check reports a problem",
      `only ${notOk.length} of ${rows.length} did — a verify block that passes on an empty database is worthless`);

    /* And the failure has to be specific, not a blanket MISSING for everything
       — the RLS and lockdown rows distinguish "absent" from "present but
       wrong", which is the distinction an operator needs. */
    const byObject = Object.fromEntries(rows.map((r) => [r.object, r.state]));
    check(byObject["funnel_events table"] === "MISSING", "before: funnel_events reported MISSING", byObject["funnel_events table"]);
    check(byObject["lifecycle_sends table"] === "MISSING", "before: lifecycle_sends reported MISSING");
    check(byObject["leads.score"] === "MISSING", "before: leads.score reported MISSING");
    check(byObject["cortex_prune_funnel_events locked down"] === "MISSING",
      "before: the prune function reported MISSING, not OK", byObject["cortex_prune_funnel_events locked down"]);
  }

  /* ---- 2. IT APPLIES ---------------------------------------------------- */
  /*
    PGlite has no `service_role` or `anon` role, and the grant/revoke lines
    name them. Create them so the real statements run verbatim rather than
    being edited for the test — an edited statement is a different statement.
  */
  await db.exec(`
    do $$ begin create role anon;          exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
  `);

  let applyError = null;
  try { await db.exec(apply); } catch (e) { applyError = e; }
  check(!applyError, "the whole file applies without error", applyError ? String(applyError.message || applyError) : "");
  if (applyError) { report(); return; }

  /* ---- 3. EVERY CHECK NOW READS OK -------------------------------------- */
  {
    const after = await db.query(verify);
    const bad = after.rows.filter((r) => r.state !== "OK");
    check(bad.length === 0, "AFTER applying: every check reports OK",
      bad.map((r) => `${r.object}=${r.state}`).join("; "));
  }

  /* ---- 4. IT IS SAFE TO RUN TWICE --------------------------------------- */
  /*
    The operator may well paste it again — that is the documented promise at
    the top of the file, and `if not exists` plus the caught duplicate_object
    is what makes it true. Assuming it is how a "safe to re-run" claim becomes
    false without anyone noticing.
  */
  {
    let second = null;
    try { await db.exec(apply); } catch (e) { second = e; }
    check(!second, "applying a second time is a no-op, not an error",
      second ? String(second.message || second) : "");

    const after2 = await db.query(verify);
    const bad2 = after2.rows.filter((r) => r.state !== "OK");
    check(bad2.length === 0, "still OK after the second run", bad2.map((r) => r.object).join("; "));
  }

  /* ---- 5. THE BEHAVIOUR THE SCHEMA EXISTS FOR --------------------------- */

  /* The score guard. This feeds a "call the worst first" sort, so a stray
     10000 would pin a healthy business to the top of that list for good. */
  {
    await db.exec(`insert into leads (name, score) values ('ok-low', 0), ('ok-high', 100), ('ok-null', null);`);
    check(true, "score accepts 0, 100 and null");

    for (const bad of [-1, 101, 10000]) {
      let threw = false;
      try { await db.exec(`insert into leads (name, score) values ('bad', ${bad});`); }
      catch { threw = true; }
      check(threw, `score rejects ${bad}`);
    }
  }

  /* THE PRIMARY KEY IS THE EXACTLY-ONCE LOCK. `on conflict do nothing` must
     claim the send once and report zero rows the second time — that is what
     stops the cron emailing the same nudge every morning. */
  {
    const { rows: [org] } = await db.query(`insert into organizations (name) values ('Acme') returning id;`);
    const claim = `insert into lifecycle_sends (org_id, stage, sent_to)
                   values ('${org.id}', 'welcome', 'a@b.com')
                   on conflict do nothing returning stage;`;
    const first = await db.query(claim);
    const again = await db.query(claim);
    check(first.rows.length === 1, "first claim of a lifecycle send succeeds", String(first.rows.length));
    check(again.rows.length === 0, "the SAME stage cannot be claimed twice — no duplicate nudge", String(again.rows.length));

    const other = await db.query(`insert into lifecycle_sends (org_id, stage)
                                  values ('${org.id}', 'import_nudge')
                                  on conflict do nothing returning stage;`);
    check(other.rows.length === 1, "a DIFFERENT stage for the same org still sends");

    /* Deleting a workspace must not leave its send history behind. */
    await db.exec(`delete from organizations where id = '${org.id}';`);
    const orphans = await db.query(`select count(*)::int as n from lifecycle_sends;`);
    check(orphans.rows[0].n === 0, "lifecycle_sends cascades when a workspace is deleted", String(orphans.rows[0].n));
  }

  /* The prune function must actually delete, and only what is older than the
     window — a retention rule that removes everything is a data-loss bug. */
  {
    await db.exec(`
      insert into funnel_events (event, created_at) values
        ('pricing_view', now() - interval '200 days'),
        ('pricing_view', now() - interval '120 days'),
        ('pricing_view', now() - interval '10 days'),
        ('signup_start', now());
    `);
    const { rows: [{ cortex_prune_funnel_events: deleted }] } =
      await db.query(`select cortex_prune_funnel_events(90);`);
    check(deleted === 2, "prune removes only rows older than the window", `deleted ${deleted}`);
    const left = await db.query(`select count(*)::int as n from funnel_events;`);
    check(left.rows[0].n === 2, "recent events survive the prune", String(left.rows[0].n));
  }

  /* An anonymous visitor writing here directly would make every number in the
     table a lie, so the grant has to be service-role only. */
  {
    const r = await db.query(`
      select has_function_privilege('anon', 'public.cortex_prune_funnel_events(int)', 'execute') as anon_can,
             has_function_privilege('authenticated', 'public.cortex_prune_funnel_events(int)', 'execute') as auth_can,
             has_function_privilege('service_role', 'public.cortex_prune_funnel_events(int)', 'execute') as svc_can;
    `);
    const { anon_can, auth_can, svc_can } = r.rows[0];
    check(anon_can === false, "anon cannot execute the prune function", String(anon_can));
    check(auth_can === false, "authenticated cannot execute the prune function", String(auth_can));
    check(svc_can === true, "service_role CAN execute it — otherwise the cron silently stops pruning", String(svc_can));
  }

  /* funnel_events.org_id is `on delete set null`, not cascade: an anonymous
     step that later attached to a workspace must survive that workspace being
     deleted, or the historical funnel counts change retroactively. */
  {
    const { rows: [org] } = await db.query(`insert into organizations (name) values ('Temp') returning id;`);
    await db.exec(`insert into funnel_events (event, org_id) values ('signup_done', '${org.id}');`);
    await db.exec(`delete from organizations where id = '${org.id}';`);
    const r = await db.query(`select count(*)::int as n from funnel_events where event = 'signup_done' and org_id is null;`);
    check(r.rows[0].n === 1, "deleting a workspace nulls the event's org but keeps the event", String(r.rows[0].n));
  }

  report();

  function report() {
    console.log(`\nRUN-NOW-2026-09-11.sql: ${pass} passed, ${fails.length} failed`);
    if (fails.length) {
      for (const f of fails) console.log("  FAIL " + f);
      process.exit(1);
    }
    console.log("  Applies cleanly, twice; the verify block fails on an empty schema and passes on an applied one.");
  }
})().catch((e) => { console.error("harness error:", e); process.exit(1); });
