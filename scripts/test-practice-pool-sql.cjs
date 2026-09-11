/*
  cortex_practice_claim / cortex_practice_release, EXECUTED.

  Run: node scripts/test-practice-pool-sql.cjs

  This function lets one workspace spend another's credits. Every argument for
  why that is safe lives in the membership and rank checks inside it, and those
  checks are exactly the kind of thing that reads correct and is not — an
  `in ('owner','admin')` that was meant to be `not in`, a check against the
  wrong org id, a guard that returns before the UPDATE on the happy path only.

  So: apply the real migration to real Postgres, then try to break in.

  auth.uid() does not exist in PGlite, so it is stubbed to read a GUC. That is
  the one deviation from production, and it is the right one — it lets the test
  impersonate each user in turn, which is the entire point.
*/
const path = require("path");
const fs = require("fs");
const ROOT = process.env.CORTEX_ROOT || path.resolve(__dirname, "..");
const { PGlite } = require(path.join(ROOT, "node_modules/@electric-sql/pglite"));

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const U = {
  partner: "aaaaaaaa-0000-0000-0000-000000000001", // owner of the firm, member of client A
  junior:  "aaaaaaaa-0000-0000-0000-000000000002", // plain member of the firm
  outsider:"aaaaaaaa-0000-0000-0000-000000000003", // member of nothing relevant
  victim:  "aaaaaaaa-0000-0000-0000-000000000004", // owner of the rich unrelated workspace
};

(async () => {
  const db = new PGlite();

  await db.exec(`
    create schema if not exists auth;
    -- Stubbed: production supplies this from the JWT. Here it reads a GUC so
    -- the test can act as each user in turn.
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid
    $$;

    create table organizations (
      id uuid primary key default gen_random_uuid(),
      name text,
      plan text default 'try',
      credits numeric default 0
    );
    create table memberships (
      org_id uuid not null references organizations(id) on delete cascade,
      user_id uuid not null,
      role text not null,
      primary key (org_id, user_id)
    );
  `);

  const mk = async (name, plan) => {
    const { rows } = await db.query(`insert into organizations (name, plan) values ($1,$2) returning id`, [name, plan]);
    return rows[0].id;
  };
  const member = (org, user, role) =>
    db.query(`insert into memberships (org_id,user_id,role) values ($1,$2,$3)`, [org, user, role]);

  const FIRM = await mk("Sharma & Co (CA)", "practice");
  const CLIENT_A = await mk("Acme Steel", "try");
  const CLIENT_B = await mk("Bolt Traders", "try");
  const RICH = await mk("Unrelated Big Co", "command");
  const CHEAPFIRM = await mk("Watch-plan firm", "watch");

  await member(FIRM, U.partner, "owner");
  await member(FIRM, U.junior, "analyst");
  await member(CLIENT_A, U.partner, "admin");
  await member(CLIENT_B, U.junior, "admin");
  /* The partner advises B as well. Needed to reach the CAP check at all: the
     guard order is rank-in-firm, then membership-of-client, then plan, then
     cap — so without this, the cap test returned "not-a-member-of-client" and
     proved nothing about the cap. The order is right; the test was wrong. */
  await member(CLIENT_B, U.partner, "admin");
  await member(RICH, U.victim, "owner");
  await member(CHEAPFIRM, U.outsider, "owner");
  await member(CLIENT_A, U.outsider, "admin"); // outsider runs a workspace the firm also advises

  /* Apply the real migration, minus its trailing verify SELECTs. */
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/2026_zzzd_practice_pool.sql"), "utf8");
  const ddl = sql.slice(0, sql.indexOf("/* ---------------------------------------------------------------- verify"));
  await db.exec(`do $$ begin create role anon; exception when duplicate_object then null; end $$;
                 do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
                 do $$ begin create role service_role; exception when duplicate_object then null; end $$;`);
  let err = null;
  try { await db.exec(ddl); } catch (e) { err = e; }
  check(!err, "the migration applies", err ? String(err.message) : "");
  if (err) return report();

  const as = async (uid, sqlText, params = []) => {
    await db.query(`select set_config('test.uid', $1, false)`, [uid || ""]);
    const { rows } = await db.query(sqlText, params);
    return Object.values(rows[0])[0];
  };
  const claim = (uid, firm, client, limit = 25) =>
    as(uid, `select cortex_practice_claim($1,$2,$3)`, [firm, client, limit]);
  const poolOf = async (org) => {
    const { rows } = await db.query(`select practice_org_id from organizations where id=$1`, [org]);
    return rows[0].practice_org_id;
  };

  /* ================================================== the happy path ==== */
  check(await claim(U.partner, FIRM, CLIENT_A) === "ok", "an owner of the firm claims a client they belong to");
  check(await poolOf(CLIENT_A) === FIRM, "the link is written on the CLIENT row", String(await poolOf(CLIENT_A)));

  /* ============================================ THE ATTACKS, one by one = */

  /* 1. The headline exploit: point at a rich stranger's balance. */
  check(await claim(U.outsider, RICH, CLIENT_A) === "not-a-member-of-firm",
    "a stranger cannot enlist an unrelated workspace as their payer");
  check(await poolOf(CLIENT_A) === FIRM, "...and the existing link is untouched");

  /* 2. Inverted: claim a workspace you are not in, to snoop or to bill it. */
  check(await claim(U.partner, FIRM, RICH) === "not-a-member-of-client",
    "a firm cannot claim a workspace nobody from it belongs to");
  check(await poolOf(RICH) === null, "...and the victim is not linked", String(await poolOf(RICH)));

  /* 3. Rank: a junior member of the firm spends the partners' money. */
  check(await claim(U.junior, FIRM, CLIENT_B) === "insufficient-rank",
    "a non-admin member of the firm cannot commit its credits");
  check(await poolOf(CLIENT_B) === null, "...and no link was written");

  /* 4. Plan: a firm that never bought pooling. */
  check(await claim(U.outsider, CHEAPFIRM, CLIENT_A) === "firm-plan-has-no-pooling",
    "a Watch-plan workspace cannot pool at all");

  /* 5. Anonymous. */
  check(await claim(null, FIRM, CLIENT_A) === "not-signed-in", "an unauthenticated caller is refused");

  /* 6. Self-claim, which the CHECK constraint also forbids. */
  check(await claim(U.partner, FIRM, FIRM) === "cannot-claim-self", "a workspace cannot pool to itself");

  /* 7. The advertised cap, enforced where it cannot be bypassed. */
  {
    check(await claim(U.partner, FIRM, CLIENT_B, 1) === "client-limit-reached",
      "the 25-client cap is enforced (tested at 1, with one already claimed)");
    /* Re-claiming an ALREADY-claimed client must not be blocked by the cap —
       otherwise a firm at its limit could never re-confirm a client it has. */
    check(await claim(U.partner, FIRM, CLIENT_A, 1) === "ok",
      "re-claiming an existing client is allowed at the cap");
  }

  /* 8. The DB constraint holds even against a direct write. */
  {
    let threw = false;
    try { await db.query(`update organizations set practice_org_id = id where id = $1`, [CLIENT_A]); }
    catch { threw = true; }
    check(threw, "the not-self constraint blocks even a direct UPDATE");
  }

  /* ==================================================== releasing ======= */
  {
    check(await as(U.outsider, `select cortex_practice_release($1)`, [CLIENT_B]) === "not-pooled",
      "releasing an unpooled workspace says so");

    /* A client admin may leave the pool without the firm's cooperation. */
    check(await as(U.outsider, `select cortex_practice_release($1)`, [CLIENT_A]) === "ok",
      "an admin of the CLIENT can leave the pool");
    check(await poolOf(CLIENT_A) === null, "...and the link is gone");

    await claim(U.partner, FIRM, CLIENT_A);
    check(await as(U.partner, `select cortex_practice_release($1)`, [CLIENT_A]) === "ok",
      "an admin of the FIRM can release too");

    await claim(U.partner, FIRM, CLIENT_A);
    check(await as(U.junior, `select cortex_practice_release($1)`, [CLIENT_A]) === "insufficient-rank",
      "someone with rank in neither cannot break the link");
  }

  /* ===================================== the grants, on the real objects = */
  {
    const r = await db.query(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'execute') as anon_can,
             has_function_privilege('authenticated', p.oid, 'execute') as auth_can
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname in ('cortex_practice_claim','cortex_practice_release')
       order by p.proname`);
    check(r.rows.length === 2, "both functions exist", String(r.rows.length));
    for (const row of r.rows) {
      check(row.anon_can === false, `anon cannot execute ${row.proname}`);
      check(row.auth_can === true, `authenticated CAN execute ${row.proname} (it checks membership itself)`);
    }
  }

  /* Deleting the firm must orphan the link, not the client's business. */
  {
    await claim(U.partner, FIRM, CLIENT_A);
    await db.query(`delete from organizations where id=$1`, [FIRM]);
    const { rows } = await db.query(`select id, practice_org_id from organizations where id=$1`, [CLIENT_A]);
    check(rows.length === 1, "the client survives its firm being deleted");
    check(rows[0].practice_org_id === null, "...and simply pays for itself again");
  }

  report();

  function report() {
    console.log(`\npractice pool SQL: ${pass} passed, ${fails.length} failed`);
    if (fails.length) { for (const f of fails) console.log("  FAIL " + f); process.exit(1); }
    console.log("  Only an admin of an entitled firm, who also belongs to the client, can direct its spend.");
  }
})().catch((e) => { console.error("harness error:", e); process.exit(1); });
