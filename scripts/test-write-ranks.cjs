#!/usr/bin/env node
/**
 * Seven tables let any member write. Verified against real Postgres (PGlite).
 *
 * WHY THIS IS AN ATTACK TEST AND NOT A POLICY-TEXT TEST.
 *
 * The integrations lockdown passed its own verification while a stray policy
 * underneath it granted everything the lockdown removed. Reading policy text
 * tells you what was written, not what the database will let a viewer do.
 * So this suite sets a real JWT claim, runs the actual PATCH/INSERT/DELETE a
 * viewer could send to PostgREST, and asserts on the row count that comes back.
 *
 * Every hole is reproduced BEFORE the migration and shown closed AFTER, and
 * legitimate use is checked in the same run — a lockdown that also breaks the
 * product is not a fix.
 */

const { PGlite } = require("@electric-sql/pglite");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

const ORG = "aaaaaaaa-0000-0000-0000-000000000001";
const USERS = {
  viewer:  "11111111-0000-0000-0000-000000000001",
  analyst: "22222222-0000-0000-0000-000000000002",
  manager: "33333333-0000-0000-0000-000000000003",
  admin:   "44444444-0000-0000-0000-000000000004",
};

/* Tables, and the rank the APP requires for each — the thing the DB must match. */
const TABLES = [
  { t: "action_tasks",        write: 2, del: 3 },
  { t: "decisions",           write: 2, del: 3 },
  { t: "quotes",              write: 2, del: 3 },
  { t: "vendors",             write: 2, del: 3 },
  { t: "collection_threads",  write: 2, del: 3 },
  { t: "collection_messages", write: 2, del: 3 },
  { t: "collection_policies", write: 4, del: 4 },
];

const SCHEMA = `
create table memberships (user_id uuid, org_id uuid, role text);
${TABLES.map(({ t }) => `
create table ${t} (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  label text
);`).join("\n")}

/* The real functions, copied from 2026_tenancy.sql. */
/*
  auth.uid() is replaced by a GUC. nullif(...,'') matters: an unset GUC reads
  as the empty string, and ''::uuid raises 22P02 rather than returning null,
  which surfaces as a query error instead of a denial — the test would then
  "pass" on an exception rather than on RLS actually refusing.
*/
create or replace function public.user_org_rank(p_org uuid)
returns int language sql stable as $$
  select coalesce(max(case m.role
           when 'owner' then 5 when 'admin' then 4 when 'manager' then 3
           when 'analyst' then 2 when 'viewer' then 1 else 0 end), 0)
    from memberships m
   where m.user_id = nullif(current_setting('app.uid', true), '')::uuid
     and m.org_id = p_org;
$$;
create or replace function public.user_org_ids()
returns setof uuid language sql stable as $$
  select org_id from memberships
   where user_id = nullif(current_setting('app.uid', true), '')::uuid;
$$;
`;

/* The any-member policies as the four migrations actually wrote them. */
const LEGACY = TABLES.map(({ t }) => `
alter table ${t} enable row level security;
create policy "members read ${t}" on ${t} for select using (org_id in (select user_org_ids()));
create policy "members write ${t}" on ${t} for insert with check (org_id in (select user_org_ids()));
create policy "members update ${t}" on ${t} for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));
create policy "members delete ${t}" on ${t} for delete using (org_id in (select user_org_ids()));
`).join("\n");

(async () => {
  const migration = readFileSync(join(ROOT, "supabase/migrations/2026_write_rank_gates.sql"), "utf8");

  const build = async (withMigration) => {
    const db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(LEGACY);
    for (const [role, uid] of Object.entries(USERS)) {
      await db.query(`insert into memberships values ($1, $2, $3)`, [uid, ORG, role]);
    }
    /* Seed one row per table BEFORE forcing RLS, as the service role would. */
    for (const { t } of TABLES) {
      await db.query(`insert into ${t} (org_id, label) values ($1, 'seed')`, [ORG]);
    }
    if (withMigration) await db.exec(migration);

    /*
      A NON-SUPERUSER IS MANDATORY, and this is worth spelling out because the
      first version of this file got it wrong and every assertion still passed.

      PGlite connects as `postgres`, a SUPERUSER. Superusers bypass RLS
      entirely. `FORCE ROW LEVEL SECURITY` does not help — FORCE subjects the
      table OWNER to its own policies, but superusers and BYPASSRLS roles are
      exempt either way. Run as postgres and a viewer's UPDATE returns
      affectedRows: 1 no matter what the policies say, so the whole "after"
      section would report a working lockdown while measuring nothing.

      So: an ordinary role with no special attributes, switched into for every
      statement. user_org_rank is SECURITY DEFINER in the real schema and plain
      SQL here, so app_user also needs to read memberships directly.
    */
    await db.exec(`
      create role app_user nologin;
      grant usage on schema public to app_user;
      grant select, insert, update, delete on all tables in schema public to app_user;
      grant execute on all functions in schema public to app_user;
    `);
    for (const { t } of TABLES) {
      await db.exec(`alter table ${t} force row level security;`);
    }
    return db;
  };

  /**
   * Run `sql` as `role`, under RLS. Returns rows read or written.
   *
   * Two things this has to get right:
   *
   *   `set_config(..., false)` — the third argument is is_local. PGlite runs
   *   each query in its own implicit transaction, so a LOCAL setting is
   *   discarded before the next statement and every call sees an unset uid.
   *   Same reason `set role` is used rather than `set local role`.
   *
   *   SELECT reports affectedRows: 0 while returning rows, and UPDATE reports
   *   affectedRows with rows: 0. Reading the wrong one made a successful read
   *   look like a denial. Pick per statement kind rather than with `??`.
   */
  const as = async (db, role, sql, params = []) => {
    await db.exec(`reset role;`);
    await db.query(`select set_config('app.uid', $1, false)`, [USERS[role]]);
    await db.exec(`set role app_user;`);
    try {
      const r = await db.query(sql, params);
      return /^\s*select/i.test(sql) ? r.rows.length : (r.affectedRows ?? 0);
    } finally {
      await db.exec(`reset role;`);
    }
  };

  /* ================================================================= */
  console.log("\nBEFORE — the holes must actually reproduce");
  /* A test that cannot demonstrate the bug proves nothing about the fix. */
  {
    const db = await build(false);
    for (const { t } of TABLES) {
      const n = await as(db, "viewer", `update ${t} set label = 'owned-by-viewer' where org_id = $1`, [ORG]);
      check(`viewer CAN update ${t} (the bug)`, n === 1);
    }
    const del = await as(db, "viewer", `delete from collection_policies where org_id = $1`, [ORG]);
    check("viewer CAN delete collection_policies (the bug)", del === 1);
    await db.close();
  }

  /* ================================================================= */
  console.log("\nAFTER — a viewer is denied every write");
  {
    const db = await build(true);
    for (const { t } of TABLES) {
      const u = await as(db, "viewer", `update ${t} set label = 'x' where org_id = $1`, [ORG]);
      check(`viewer cannot update ${t}`, u === 0);
      const i = await as(db, "viewer", `insert into ${t} (org_id, label) values ($1, 'x')`, [ORG])
        .then((n) => n).catch(() => "threw");
      check(`viewer cannot insert into ${t}`, i === 0 || i === "threw");
      const d = await as(db, "viewer", `delete from ${t} where org_id = $1`, [ORG]);
      check(`viewer cannot delete from ${t}`, d === 0);
    }

    console.log("\n  ...but can still READ — workspace-wide read is the design");
    for (const { t } of TABLES) {
      const r = await as(db, "viewer", `select id from ${t} where org_id = $1`, [ORG]);
      check(`viewer can still read ${t}`, r >= 1);
    }
    await db.close();
  }

  /* ================================================================= */
  console.log("\nAFTER — legitimate use is unaffected");
  {
    const db = await build(true);
    for (const { t, write, del } of TABLES) {
      const role = write === 4 ? "admin" : "analyst";
      const u = await as(db, role, `update ${t} set label = 'ok' where org_id = $1`, [ORG]);
      check(`${role} can update ${t}`, u === 1);

      const delRole = del === 4 ? "admin" : "manager";
      const d = await as(db, delRole, `delete from ${t} where org_id = $1`, [ORG]);
      check(`${delRole} can delete from ${t}`, d === 1);
    }
    await db.close();
  }

  /* ================================================================= */
  console.log("\nTHE RANK BOUNDARY — one below must fail, exactly at must pass");
  {
    const db = await build(true);
    /* collection_policies is admin-only, so a MANAGER must be refused. This is
       the check that distinguishes a real gate from "anything above viewer". */
    const m = await as(db, "manager", `update collection_policies set label='x' where org_id=$1`, [ORG]);
    check("manager cannot change the collections policy (admin-only)", m === 0);
    const a = await as(db, "admin", `update collection_policies set label='x' where org_id=$1`, [ORG]);
    check("admin can", a === 1);

    /* Delete on the standard tables is manager, so an ANALYST must be refused. */
    const an = await as(db, "analyst", `delete from quotes where org_id=$1`, [ORG]);
    check("analyst cannot delete quotes (manager-only)", an === 0);
    const mg = await as(db, "manager", `delete from quotes where org_id=$1`, [ORG]);
    check("manager can", mg === 1);
    await db.close();
  }

  /* ================================================================= */
  console.log("\nNO FOR-ALL POLICY SURVIVES — the integrations mistake, not repeated");
  {
    /* A single permissive FOR ALL policy left by an older migration would be
       OR'd with the rank gates and make all of the above meaningless. */
    const db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(LEGACY);
    for (const { t } of TABLES) {
      await db.exec(`create policy "legacy ${t}" on ${t} for all
        using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));`);
    }
    await db.exec(migration);

    const left = await db.query(`
      select tablename, policyname from pg_policies
      where schemaname='public' and cmd='ALL'
        and tablename in (${TABLES.map(({ t }) => `'${t}'`).join(",")})`);
    check(`no FOR ALL policy remains (found ${left.rows.length})`, left.rows.length === 0);

    const counts = await db.query(`
      select tablename, count(*)::int n from pg_policies
      where schemaname='public' and tablename in (${TABLES.map(({ t }) => `'${t}'`).join(",")})
      group by tablename order by tablename`);
    check(`every table has exactly 4 policies (${counts.rows.map((r) => r.n).join(",")})`,
          counts.rows.length === TABLES.length && counts.rows.every((r) => r.n === 4));
    await db.close();
  }

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
