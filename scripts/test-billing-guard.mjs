/**
 * The billing guard, executed against a real Postgres.
 *
 * WHY THIS RUNS THE ACTUAL SQL.
 *
 * The migration this tests (2026_org_billing_guard.sql) closes a hole where any
 * workspace owner could PATCH their own organizations row through PostgREST and
 * set `credits_allowance = -1`, which lib/credits.ts treats as "unlimited, stop
 * metering". Every AI action in the product then runs free, including Veo video
 * at roughly ₹77 a clip.
 *
 * A guard like that is only worth what it does when executed. Reading the SQL
 * and agreeing that it looks right is how the original hole survived review in
 * the first place — the RLS policy also looked right, because row-level and
 * column-level are easy to conflate. So this loads the migration file THAT
 * SHIPS, runs it on a real Postgres (PGlite), creates the same two roles
 * PostgREST uses, and tries the actual attack.
 *
 * It also asserts the legitimate paths still work, because a guard that blocks
 * the payment webhook is an outage, not a fix.
 *
 * The last check is the one that will matter in six months: it reads the
 * protected-column list out of the migration and compares it against the
 * billing columns lib/credits.ts and lib/entitlement.ts actually read. Add a
 * column to the table, forget to protect it, and this fails.
 */

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let pass = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  ok    ${n}`); };
const bad = (n, d) => { failures.push(`${n}\n      ${d}`); console.log(`  FAIL  ${n}\n        ${d}`); };
function check(cond, name, detail = "") { cond ? ok(name) : bad(name, detail); }

const MIGRATION = "supabase/migrations/2026_org_billing_guard.sql";
const sql = readFileSync(MIGRATION, "utf8");

/* The migration must actually be the thing under test. */
check(/create trigger cortex_org_billing_guard/i.test(sql),
  "migration: declares the trigger", "trigger not found — this test would prove nothing");
check(/before update on organizations/i.test(sql),
  "migration: fires BEFORE UPDATE on organizations");

const db = new PGlite();

async function main() {
  /*
    Reproduce the two roles PostgREST switches into. A request with the anon key
    runs as `anon`; one carrying a signed-in user's JWT runs as `authenticated`.
    The service-role key runs as `service_role`. This is what current_user sees.
  */
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;

    create table organizations (
      id uuid primary key default gen_random_uuid(),
      name text,
      industry text,
      accent text,
      logo_url text,
      annual_revenue_cr numeric,
      currency text,
      credits bigint not null default 0,
      credits_allowance bigint,
      credits_reset_at timestamptz,
      plan text default 'starter',
      subscription_status text default 'trialing',
      subscription_ends_at timestamptz,
      subscription_cycle text,
      subscription_ref text,
      trial_ends_at timestamptz,
      autorenew_status text,
      autorenew_next timestamptz
    );
    grant select, update on organizations to authenticated, anon, service_role;
  `);

  await db.exec(sql);
  ok("migration: applied cleanly to a real Postgres");

  const { rows: [org] } = await db.query(
    `insert into organizations (name, plan, credits, credits_allowance)
     values ('Acme', 'starter', 100, null) returning id`
  );
  const ID = org.id;

  /** Run a statement as a given role; return the error message or null. */
  async function asRole(role, statement) {
    await db.exec(`set role ${role};`);
    let err = null;
    try { await db.exec(statement); } catch (e) { err = String(e.message || e); }
    await db.exec(`reset role;`);
    return err;
  }
  const value = async (col) =>
    (await db.query(`select ${col} as v from organizations where id = $1`, [ID])).rows[0].v;

  /* ------------------------------------------------------ THE ACTUAL ATTACK */

  const attack = await asRole("authenticated",
    `update organizations set credits_allowance = -1 where id = '${ID}'`);
  check(attack !== null, "attack: authenticated CANNOT set credits_allowance = -1",
    "the update succeeded — metering can still be switched off from the browser");
  check(attack !== null && /billing-controlled/.test(attack),
    "attack: fails with the guard's own message", `got: ${attack}`);
  check(await value("credits_allowance") === null,
    "attack: the value on disk is unchanged",
    `credits_allowance is now ${await value("credits_allowance")}`);

  /* Each protected column, individually — a guard that covers only the famous
     one is not a guard. */
  const attacks = {
    credits: "999999999",
    credits_reset_at: "'2099-01-01'",
    plan: "'enterprise'",
    subscription_status: "'active'",
    subscription_ends_at: "'2099-01-01'",
    subscription_cycle: "'annual'",
    subscription_ref: "'sub_forged'",
    trial_ends_at: "'2099-01-01'",
    autorenew_status: "'ACTIVE'",
    autorenew_next: "'2099-01-01'",
  };
  for (const [col, val] of Object.entries(attacks)) {
    const e = await asRole("authenticated", `update organizations set ${col} = ${val} where id = '${ID}'`);
    check(e !== null, `attack: authenticated cannot write ${col}`, "update succeeded");
  }

  /* anon too — a leaked anon key plus a permissive policy is the same hole. */
  const anonAttack = await asRole("anon",
    `update organizations set plan = 'enterprise' where id = '${ID}'`);
  check(anonAttack !== null, "attack: anon cannot write plan either", "update succeeded");

  /* The combined PATCH a real attacker would send, all columns at once. */
  const combined = await asRole("authenticated",
    `update organizations set credits_allowance = -1, plan = 'enterprise',
       subscription_status = 'active', subscription_ends_at = '2099-01-01'
     where id = '${ID}'`);
  check(combined !== null, "attack: the full four-column PATCH is rejected", "it went through");
  check(await value("plan") === "starter", "attack: plan still 'starter' afterwards");

  /* ------------------------------------------------- LEGITIMATE PATHS WORK */
  // If any of these fail the guard is an outage, not a fix.

  const settings = await asRole("authenticated",
    `update organizations set name = 'Acme Industries', industry = 'manufacturing',
       currency = 'INR', accent = 'gold', logo_url = 'https://x/y.png',
       annual_revenue_cr = 12.5 where id = '${ID}'`);
  check(settings === null, "legit: an admin can still save workspace settings", String(settings));
  check(await value("name") === "Acme Industries", "legit: the name actually changed");

  const webhook = await asRole("service_role",
    `update organizations set plan = 'growth', credits = 4600,
       subscription_status = 'active' where id = '${ID}'`);
  check(webhook === null, "legit: the payment webhook (service_role) can grant a plan", String(webhook));
  check(await value("plan") === "growth", "legit: the plan really was granted");

  // The migration runner / SQL editor must not be locked out of its own table.
  let migrationOk = null;
  try { await db.exec(`update organizations set credits = credits + 1 where id = '${ID}'`); }
  catch (e) { migrationOk = String(e.message || e); }
  check(migrationOk === null, "legit: superuser/migrations are not blocked", String(migrationOk));

  /* A no-op write of the same value must not trip the guard: PostgREST sends
     full-row updates, and `is distinct from` should see no change. */
  const noop = await asRole("authenticated",
    `update organizations set name = 'Acme Industries', plan = 'growth' where id = '${ID}'`);
  check(noop === null, "legit: re-sending an UNCHANGED billing column is allowed",
    `a full-row PATCH that changes nothing was rejected: ${noop}`);

  /* ------------------------------- the health check must not be able to lie */
  /*
    lib/health.ts reports "Schema migrations: operational" partly on the word of
    cortex_has_billing_guard(). If that function returned true unconditionally,
    the operator would be told a security control is installed when it is not —
    strictly worse than not checking at all.

    So: assert it says true with the trigger present, then DROP the trigger and
    assert it says false.
  */
  const guardSays = async () =>
    (await db.query(`select cortex_has_billing_guard() as v`)).rows[0].v;

  check(await guardSays() === true,
    "health: cortex_has_billing_guard() reports the guard as present", `got ${await guardSays()}`);

  await db.exec(`drop trigger cortex_org_billing_guard on organizations;`);
  check(await guardSays() === false,
    "health: and reports FALSE once the trigger is gone",
    "the helper would tell the operator the guard is installed when it is not");

  // Put it back so the coverage checks below run against the real state.
  await db.exec(`
    create trigger cortex_org_billing_guard
      before update on organizations
      for each row execute function cortex_guard_org_billing();`);
  check(await guardSays() === true, "health: reports true again after reinstalling");

  /* --------------------------------------- the list must stay comprehensive */
  /*
    The trigger allows any column it does not name. That is deliberate — the
    alternative (column GRANTs) turns "someone added a column" into a production
    outage. The cost is that it must be kept honest, which is this check's job.
  */
  const listed = new Set(
    (sql.match(/protected constant text\[\] :=\s*array\[([\s\S]*?)\]/)?.[1] || "")
      .match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, "")) || []
  );
  check(listed.size >= 10, "parse: read the protected-column list from the migration",
    `only parsed ${listed.size} columns — the check below would be vacuous`);

  const billingSrc =
    readFileSync("src/lib/credits.ts", "utf8") + readFileSync("src/lib/entitlement.ts", "utf8");
  const MUST_COVER = [
    "credits", "credits_allowance", "credits_reset_at", "plan",
    "subscription_status", "subscription_ends_at", "trial_ends_at",
  ];
  for (const col of MUST_COVER) {
    if (!billingSrc.includes(col)) continue;   // not actually read; nothing to protect
    check(listed.has(col), `coverage: ${col} is read by billing code and is protected`,
      `credits.ts/entitlement.ts reads "${col}" but the trigger does not guard it`);
  }

  /* ----------------------------------------------------------------- report */
  console.log(`\nbilling guard: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log(`  ${listed.size} protected columns, each attack attempted for real on Postgres.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
