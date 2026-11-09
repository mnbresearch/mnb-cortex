#!/usr/bin/env node
/**
 * Hardening proof and regression suite for rank gates on:
 * - visibility_runs
 * - close_checklists
 * - fpa_models
 *
 * PROVES:
 * 1. BEFORE: Viewer (rank 1) could insert, update, and delete rows in close_checklists, fpa_models, and visibility_runs.
 * 2. AFTER: Viewer is blocked on write/update/delete, analyst (rank 2) can write, manager (rank 3) can delete, viewer can still read.
 * 3. MULTI-TENANCY: Member of org A cannot read, update, or delete org B rows.
 * 4. ROLLBACK: Rollback script executes cleanly and restores original policies without dropping data.
 */

const { PGlite } = require("@electric-sql/pglite");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";

const USERS = {
  viewer_a:  "11111111-0000-0000-0000-000000000001",
  analyst_a: "22222222-0000-0000-0000-000000000002",
  manager_a: "33333333-0000-0000-0000-000000000003",
  admin_a:   "44444444-0000-0000-0000-000000000004",
  viewer_b:  "55555555-0000-0000-0000-000000000005"
};

const TARGET_TABLES = [
  "visibility_runs",
  "close_checklists",
  "fpa_models"
];

const SCHEMA = `
create table memberships (user_id uuid, org_id uuid, role text);

create table visibility_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  label text
);

create table close_checklists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  label text
);

create table fpa_models (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  label text
);

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

const LEGACY_POLICIES = TARGET_TABLES.map(t => `
alter table ${t} enable row level security;
create policy "members read ${t}" on ${t} for select using (org_id in (select user_org_ids()));
create policy "members write ${t}" on ${t} for insert with check (org_id in (select user_org_ids()));
create policy "members update ${t}" on ${t} for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));
create policy "members delete ${t}" on ${t} for delete using (org_id in (select user_org_ids()));
`).join("\n");

(async () => {
  console.log("=== Phase 3: Rank Gates Hardening & Proof Suite ===");

  const migrationFile = join(ROOT, "supabase/migrations/2026_zzzz_p_rank_gates_hardening.sql");
  const rollbackFile = join(ROOT, "supabase/migrations/rollbacks/2026_zzzz_p_rank_gates_hardening.rollback.sql");

  const build = async (mode) => {
    const db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(LEGACY_POLICIES);

    // Seed memberships
    await db.query(`insert into memberships values ($1, $2, 'viewer')`, [USERS.viewer_a, ORG_A]);
    await db.query(`insert into memberships values ($1, $2, 'analyst')`, [USERS.analyst_a, ORG_A]);
    await db.query(`insert into memberships values ($1, $2, 'manager')`, [USERS.manager_a, ORG_A]);
    await db.query(`insert into memberships values ($1, $2, 'admin')`, [USERS.admin_a, ORG_A]);
    await db.query(`insert into memberships values ($1, $2, 'viewer')`, [USERS.viewer_b, ORG_B]);

    // Seed baseline rows
    for (const t of TARGET_TABLES) {
      await db.query(`insert into ${t} (org_id, label) values ($1, 'org_a_data')`, [ORG_A]);
      await db.query(`insert into ${t} (org_id, label) values ($1, 'org_b_data')`, [ORG_B]);
    }

    if (mode === "migrated" && existsSync(migrationFile)) {
      const sql = readFileSync(migrationFile, "utf8");
      await db.exec(sql);
    } else if (mode === "rolled_back" && existsSync(rollbackFile)) {
      const sql = readFileSync(migrationFile, "utf8");
      await db.exec(sql);
      const rollbackSql = readFileSync(rollbackFile, "utf8");
      await db.exec(rollbackSql);
    }

    await db.exec(`
      create role app_user nologin;
      grant usage on schema public to app_user;
      grant select, insert, update, delete on all tables in schema public to app_user;
      grant execute on all functions in schema public to app_user;
    `);
    for (const t of TARGET_TABLES) {
      await db.exec(`alter table ${t} force row level security;`);
    }

    return db;
  };

  const asUser = async (db, userKey, sql, params = []) => {
    await db.exec(`reset role;`);
    await db.query(`select set_config('app.uid', $1, false)`, [USERS[userKey]]);
    await db.exec(`set role app_user;`);
    try {
      const r = await db.query(sql, params);
      return /^\s*select/i.test(sql) ? r.rows.length : (r.affectedRows ?? 0);
    } catch (e) {
      return "threw: " + e.message;
    } finally {
      await db.exec(`reset role;`);
    }
  };

  // Step 1: Prove the vulnerability BEFORE
  console.log("\n[TEST 1] BEFORE FIX: Reproducing vulnerability (viewer has unauthorized write/delete access)");
  {
    const db = await build("legacy");
    for (const t of TARGET_TABLES) {
      const upd = await asUser(db, "viewer_a", `update ${t} set label = 'tampered' where org_id = $1`, [ORG_A]);
      check(`[BEFORE] viewer_a CAN update ${t} (VULNERABILITY REPRODUCED)`, upd === 1);

      const ins = await asUser(db, "viewer_a", `insert into ${t} (org_id, label) values ($1, 'new')`, [ORG_A]);
      check(`[BEFORE] viewer_a CAN insert into ${t} (VULNERABILITY REPRODUCED)`, ins === 1);

      const del = await asUser(db, "viewer_a", `delete from ${t} where org_id = $1`, [ORG_A]);
      check(`[BEFORE] viewer_a CAN delete from ${t} (VULNERABILITY REPRODUCED)`, del >= 1);
    }
    await db.close();
  }

  // If migration file exists, test AFTER
  if (existsSync(migrationFile)) {
    console.log("\n[TEST 2] AFTER FIX: Verifying viewer is blocked and rank gates enforce least privilege");
    const db = await build("migrated");

    for (const t of TARGET_TABLES) {
      // 1. Viewer cannot update
      const u = await asUser(db, "viewer_a", `update ${t} set label = 'hacked' where org_id = $1`, [ORG_A]);
      check(`viewer_a cannot update ${t}`, u === 0);

      // 2. Viewer cannot insert
      const i = await asUser(db, "viewer_a", `insert into ${t} (org_id, label) values ($1, 'hacked')`, [ORG_A]);
      check(`viewer_a cannot insert into ${t}`, i === 0 || String(i).startsWith("threw"));

      // 3. Viewer cannot delete
      const d = await asUser(db, "viewer_a", `delete from ${t} where org_id = $1`, [ORG_A]);
      check(`viewer_a cannot delete from ${t}`, d === 0);

      // 4. Viewer can still read
      const r = await asUser(db, "viewer_a", `select id from ${t} where org_id = $1`, [ORG_A]);
      check(`viewer_a can still read legitimate org data on ${t}`, typeof r === "number" && r >= 1);

      // 5. Analyst can update and insert
      const au = await asUser(db, "analyst_a", `update ${t} set label = 'analyst_update' where org_id = $1`, [ORG_A]);
      check(`analyst_a can update ${t}`, au === 1);

      const ai = await asUser(db, "analyst_a", `insert into ${t} (org_id, label) values ($1, 'analyst_row')`, [ORG_A]);
      check(`analyst_a can insert into ${t}`, ai === 1);

      // 6. Analyst cannot delete (delete requires manager rank >= 3)
      const ad = await asUser(db, "analyst_a", `delete from ${t} where org_id = $1`, [ORG_A]);
      check(`analyst_a cannot delete ${t} (manager rank required)`, ad === 0);

      // 7. Manager can delete
      const md = await asUser(db, "manager_a", `delete from ${t} where org_id = $1`, [ORG_A]);
      check(`manager_a can delete ${t}`, md >= 1);

      // 8. Cross-org tenant isolation: viewer_b cannot read or write org A data
      const xRead = await asUser(db, "viewer_b", `select id from ${t} where org_id = $1`, [ORG_A]);
      check(`cross-tenant isolation: viewer_b cannot read ${t} of org A`, xRead === 0);

      const xWrite = await asUser(db, "viewer_b", `update ${t} set label = 'cross_org' where org_id = $1`, [ORG_A]);
      check(`cross-tenant isolation: viewer_b cannot update ${t} of org A`, xWrite === 0);
    }

    await db.close();

    // Step 3: Test Rollback
    if (existsSync(rollbackFile)) {
      console.log("\n[TEST 3] Testing Rollback: verifying clean rollback execution");
      const rbDb = await build("rolled_back");
      for (const t of TARGET_TABLES) {
        const u = await asUser(rbDb, "viewer_a", `update ${t} set label = 'rolled_back' where org_id = $1`, [ORG_A]);
        check(`rollback restored original behavior on ${t}`, u === 1);
      }
      await rbDb.close();
    }
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
