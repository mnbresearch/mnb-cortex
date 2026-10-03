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
/*
  TWO FILES, APPLIED IN ORDER, BECAUSE THAT IS WHAT PRODUCTION HAS.

  2026_zzzp widens the protected list to cover practice_org_id and
  referral_code. Testing only the original would assert the guard as it was
  before the hole was closed — which is how this test passed while the hole
  was open.
*/
const WIDENING = "supabase/migrations/2026_zzzp_guard_practice_link.sql";
const baseSql = readFileSync(MIGRATION, "utf8");
const widenSql = readFileSync(WIDENING, "utf8")
  /* Strip the trailing verify SELECT; PGlite's exec is fine with it but the
     result is noise and cortex_has_billing_guard may not exist yet. */
  .replace(/\/\* -+ verify -+[\s\S]*$/, "");
const sql = `${baseSql}\n${widenSql}`;

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
      autorenew_next timestamptz,
      /*
        ADDED AFTER THE FIXTURE MISSED A REAL COLUMN FOR MONTHS.

        This CREATE TABLE is hand-written, and it used to stop at
        autorenew_next — a copy of the protected list, which is the one thing
        it must not be. 2026_zzzd_practice_pool.sql added practice_org_id to
        the real table in 2026; the fixture never heard about it, so the
        attack below could not be attempted on it and the coverage check two
        hundred lines down had nothing to compare. The column that decides
        WHOSE CREDITS PAY was writable by any workspace owner the whole time.

        The derivation check at the end of this file now reads the column set
        out of the migrations, so a fixture that falls behind fails loudly
        rather than quietly narrowing what is tested.
      */
      practice_org_id uuid references organizations(id) on delete set null,
      referral_code text,
      statutory_profile jsonb,
      billing_phone text
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
    /*
      THE ONE THIS TEST MISSED.

      practice_org_id names the org whose credits pay for every AI action in
      this workspace, and whose plan decides whether this workspace is
      unlocked at all. src/lib/credit-pool.ts opens by naming the exact attack
      — "sign up, point practice_org_id at a large paying firm, and spend
      their month" — and asserts "only the firm can write it". Nothing
      enforced that until 2026_zzzp.

      Note the null-to-value direction: the column is normally NULL, so a
      guard written with <> instead of `is distinct from` would still let this
      through. The migration uses `is distinct from`; this exercises it.
    */
    practice_org_id: "'00000000-0000-0000-0000-0000000000ff'",
    referral_code: "'STOLEN1'",
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
  /*
    THE LAST ARRAY WINS, because `create or replace function` means the last
    definition applied is the one Postgres holds. Reading the FIRST match
    parsed the 2026 list out of the original migration and reported the
    widened one as missing — i.e. it described a function that no longer
    exists. Exactly the kind of near-miss this file is for.
  */
  const arrays = [...sql.matchAll(/protected constant text\[\] :=\s*array\[([\s\S]*?)\]/g)];
  check(arrays.length >= 1, "parse: found a protected-column array at all");
  const listed = new Set(
    (arrays[arrays.length - 1]?.[1] || "")
      .match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, "")) || []
  );
  check(listed.size >= 10, "parse: read the protected-column list from the migration",
    `only parsed ${listed.size} columns — the check below would be vacuous`);

  const billingSrc =
    readFileSync("src/lib/credits.ts", "utf8") + readFileSync("src/lib/entitlement.ts", "utf8");
  const MUST_COVER = [
    "credits", "credits_allowance", "credits_reset_at", "plan",
    "subscription_status", "subscription_ends_at", "trial_ends_at",
    "practice_org_id",   // whose credits pay; read by credits.ts via credit-pool
  ];
  for (const col of MUST_COVER) {
    if (!billingSrc.includes(col)) continue;   // not actually read; nothing to protect
    check(listed.has(col), `coverage: ${col} is read by billing code and is protected`,
      `credits.ts/entitlement.ts reads "${col}" but the trigger does not guard it`);
  }

  /* ======================================================================= */
  /* EVERY COLUMN MUST BE CLASSIFIED — derived, not hand-listed              */
  /* ======================================================================= */
  /*
    WHY THE CHECK ABOVE IS NOT ENOUGH, AND WHY IT FAILED.

    MUST_COVER is a list someone types. 2026_zzzd_practice_pool.sql added
    practice_org_id to organizations in 2026; nobody went back and typed it
    here, and `if (!billingSrc.includes(col)) continue` means an absent name
    costs nothing — the loop simply had one fewer thing to say. The guard's
    own header promised "add a column to the table, forget to protect it, and
    this fails". It did not fail. For months the column that redirects who
    pays was writable by any workspace owner through PostgREST.

    So stop typing the list. Derive the column set from the migrations — the
    same files that create the table — and require EVERY column to be either:

      · in the trigger's protected array, or
      · in SAFE_TO_SELF_EDIT below, with a reason.

    The database still allows-by-default (2026_org_billing_guard.sql explains
    at length why column GRANTs are the wrong instrument: a new column would
    become a production outage instead of a gap). This check puts the
    strictness in the TEST instead, where a new column costs someone thirty
    seconds of classification and cannot cost a customer their credits.
  */
  const migrationDir = "supabase/migrations";
  const { readdirSync } = await import("node:fs");
  const orgColumns = new Set();
  /*
    schema.sql holds the CREATE TABLE; the migrations hold everything added
    since. Both, or the derived set is only the columns someone remembered to
    add later — which is most of the risk, but not the claim this check makes.
  */
  const sqlSources = ["supabase/schema.sql", ...readdirSync(migrationDir).map((f) => `${migrationDir}/${f}`)];
  for (const path of sqlSources) {
    if (!path.endsWith(".sql")) continue;
    const src = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
    /* create table organizations ( ... ) */
    const created = src.match(/create table (?:if not exists )?(?:public\.)?organizations\s*\(([\s\S]*?)\n\s*\);/i);
    if (created) {
      for (const line of created[1].split("\n")) {
        const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s+[a-z]/i);
        if (m && !/^(primary|unique|check|constraint|foreign|references)$/i.test(m[1])) {
          orgColumns.add(m[1].toLowerCase());
        }
      }
    }
    /* alter table organizations add column [if not exists] <name> */
    const alterBlocks = src.matchAll(
      /alter table (?:if exists )?(?:public\.)?organizations\b([\s\S]*?);/gi
    );
    for (const blk of alterBlocks) {
      for (const m of blk[1].matchAll(/add column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)/gi)) {
        orgColumns.add(m[1].toLowerCase());
      }
    }
  }

  check(orgColumns.size >= 15, "derive: read the organizations column set from the migrations",
    `only found ${orgColumns.size} columns (${[...orgColumns].join(", ")}) — ` +
    `the classification check below would be vacuous`);
  check(orgColumns.has("practice_org_id"),
    "derive: the derivation sees a column added by a LATER migration",
    "practice_org_id was added in 2026_zzzd — if the parser cannot see it, " +
    "this check has the same blind spot as the hand-written list it replaces");

  /*
    Columns a workspace owner may legitimately change. Every entry is
    something the product's own settings UI writes — verified against
    actions.ts:updateOrgProfile and api/workspace/*.
  */
  const SAFE_TO_SELF_EDIT = new Map([
    ["id", "the primary key; RLS scopes the row, not this"],
    ["created_at", "set by default; harmless"],
    ["updated_at", "bookkeeping"],
    ["name", "workspace settings"],
    ["industry", "workspace settings / onboarding"],
    ["accent", "white-label theming"],
    ["logo_url", "white-label theming"],
    ["annual_revenue_cr", "workspace profile, used for sizing not billing"],
    ["currency", "display only"],
    ["billing_phone", "contact detail for invoices; not an entitlement"],
    ["statutory_profile", "which statutes apply to this business; no money effect"],
    ["is_demo", "demo-data marker"],
    ["owner_id", "set at creation; membership is the real control"],
    ["slug", "display"],
    ["whatsapp_template", "collections template name"],
    ["whatsapp_lang", "collections template language"],
    ["reply_to", "outbound reply address"],
    ["gst_turnover", "statutory sizing input"],
    ["gst_tax", "statutory sizing input"],
    ["company", "display"],
    ["note", "free text"],
    ["meta", "free-form settings blob"],
    ["source", "attribution"],
    ["score", "derived"],
    ["search", "derived"],
  ]);

  const unclassified = [...orgColumns].filter(
    (c) => !listed.has(c) && !SAFE_TO_SELF_EDIT.has(c)
  ).sort();
  check(unclassified.length === 0,
    "classify: every organizations column is either protected or declared safe",
    unclassified.length
      ? `UNCLASSIFIED: ${unclassified.join(", ")} — decide for each whether a ` +
        `workspace owner may write it. If it decides entitlement, payment, ` +
        `identity or attribution, add it to the trigger's protected array ` +
        `(a new create-or-replace migration). If it is a harmless setting, ` +
        `add it to SAFE_TO_SELF_EDIT here with a reason.`
      : "");

  /* The fixture must not fall behind the schema either — that is the other
     half of how practice_org_id went untested for months. */
  const { rows: fixtureCols } = await db.query(
    `select column_name from information_schema.columns
      where table_name = 'organizations' and table_schema = 'current_schema'()`
  ).catch(() => ({ rows: [] }));
  const inFixture = new Set(
    (fixtureCols.length
      ? fixtureCols
      : (await db.query(
          `select column_name from information_schema.columns where table_name = 'organizations'`
        )).rows
    ).map((r) => String(r.column_name).toLowerCase())
  );
  const protectedMissingFromFixture = [...listed].filter((c) => !inFixture.has(c)).sort();
  check(protectedMissingFromFixture.length === 0,
    "fixture: every protected column exists in the test table, so the attack is really attempted",
    protectedMissingFromFixture.length
      ? `the trigger protects ${protectedMissingFromFixture.join(", ")} but the ` +
        `CREATE TABLE at the top of this file has no such column, so no attack ` +
        `was run against it`
      : "");

  /* --------------------------------------------------- shared payments table
     The `payments` table is shared with another product in the same Supabase
     project — a school/tuition app keyed on owner_id, whose rows also carry
     status='paid'. admin-metrics summed every paid row, so that app's takings
     were reported as MNB Cortex revenue (the ~₹79K of null-org_id rows).

     Cortex's three write paths — settleOrder, the subscription webhook, and
     the amount_mismatch record — all set `kind`; the other app never does.
     Pinning both halves: the filter must be present, and every write path must
     keep setting the column the filter depends on. Drop either and the number
     on the admin dashboard silently stops being revenue.
  */
  {
    const metrics = readFileSync("src/lib/admin-metrics.ts", "utf8");
    check(/\.not\("kind",\s*"is",\s*null\)/.test(metrics),
      "admin-metrics filters payments to rows Cortex wrote",
      "revenueTotal sums every status='paid' row, including the other app's");

    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const [file, label] of [
      ["src/lib/pay/settle.ts", "settleOrder"],
      ["src/app/api/pay/cashfree/webhook/route.ts", "the subscription webhook"],
    ]) {
      const src = strip(readFileSync(file, "utf8"));
      const upserts = src.match(/\.upsert\(\s*\{[^}]*\}/g) || [];
      const paymentUpserts = upserts.filter((u) => /order_id/.test(u));
      check(paymentUpserts.length > 0 && paymentUpserts.every((u) => /kind:/.test(u)),
        `${label} sets kind on every payments upsert`,
        `${file} writes a payments row without kind — it would drop out of revenue`);
    }
  }

  /* ======================================================================= */
  /* THE LEGITIMATE PATH STILL WORKS, AND THE CAP IS NO LONGER THE CALLER'S  */
  /* ======================================================================= */
  /*
    Two things have to be true at once, and proving one without the other is
    how a security fix becomes an outage:

      1. A client can no longer attach ITSELF to a firm (the attack above,
         now blocked by the trigger).
      2. A FIRM can still claim a client (the feature, which goes through
         cortex_practice_claim).

    (2) survives (1) only because the claim function is SECURITY DEFINER, so
    current_user inside it is the function's owner and the guard's
    `not in ('authenticated','anon')` test lets it through. That is a subtle
    dependency between two files, and the kind of thing that reads as obvious
    right up until someone "tidies" the function to invoker rights — which is
    a mistake 2026_org_billing_guard.sql records having already made once, in
    the other direction, on this very trigger.

    So it is executed, not reasoned about. auth.uid() is stubbed over a GUC,
    which is what Supabase's own local tooling does.
  */
  {
    await db.exec(`
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid
        language sql stable as $fn$
          select nullif(current_setting('test.uid', true), '')::uuid
        $fn$;
      create table memberships (org_id uuid, user_id uuid, role text);
      grant select on memberships to authenticated, anon;
    `);

    const FIRM = "11111111-1111-1111-1111-111111111111";
    const CLIENT = "22222222-2222-2222-2222-222222222222";
    const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const OUTSIDER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    await db.exec(`
      insert into organizations (id, name, plan) values
        ('${FIRM}',   'Firm & Co', 'practice'),
        ('${CLIENT}', 'Client Ltd', 'watch');
      insert into memberships values
        ('${FIRM}',   '${ADMIN}',    'owner'),
        ('${CLIENT}', '${ADMIN}',    'admin'),
        ('${CLIENT}', '${OUTSIDER}', 'owner');
    `);

    /** Call the RPC the way the browser would: as `authenticated`, as a user. */
    async function claim(uid, args) {
      await db.exec(`select set_config('test.uid', '${uid}', false);`);
      await db.exec(`set role authenticated;`);
      let out, err = null;
      try {
        out = (await db.query(`select cortex_practice_claim($1,$2,$3) as v`, args)).rows[0].v;
      } catch (e) { err = String(e.message || e); }
      await db.exec(`reset role;`);
      return err ? `ERROR:${err}` : out;
    }
    const linkOf = async (id) =>
      (await db.query(`select practice_org_id as v from organizations where id = $1`, [id])).rows[0].v;

    /* (1) The feature works — and this is also the proof that the new trigger
           did not break it. */
    check(await claim(ADMIN, [FIRM, CLIENT, 25]) === "ok",
      "pool: a firm admin can still claim a client through the RPC",
      "the trigger added by this migration has broken the legitimate path — " +
      "cortex_practice_claim must stay SECURITY DEFINER");
    check(String(await linkOf(CLIENT)) === FIRM,
      "pool: and the link is actually written",
      "the RPC said ok but practice_org_id did not change");

    /* (2) The attack the trigger exists for, from the client's own session. */
    await db.exec(`update organizations set practice_org_id = null where id = '${CLIENT}';`);
    await db.exec(`select set_config('test.uid', '${OUTSIDER}', false);`);
    const selfAttach = await asRole("authenticated",
      `update organizations set practice_org_id = '${FIRM}' where id = '${CLIENT}'`);
    check(selfAttach !== null,
      "pool: a client owner CANNOT attach their own workspace to a firm",
      "this is the exploit credit-pool.ts names in its own header — " +
      "sign up, point practice_org_id at a paying firm, spend their month");
    check(await linkOf(CLIENT) === null,
      "pool: and nothing was written",
      `practice_org_id is now ${await linkOf(CLIENT)}`);

    /* (3) Rank is still required. */
    check(await claim(OUTSIDER, [FIRM, CLIENT, 25]) === "not-a-member-of-firm",
      "pool: a non-member of the firm cannot claim against it");

    /* (4) THE CAP. Fill the firm to its plan limit, then ask for more with
           p_limit = -1 — the exact bypass, sent the way a browser would. */
    await db.exec(`
      insert into organizations (id, name, plan, practice_org_id)
      select gen_random_uuid(), 'C' || g, 'watch', '${FIRM}'
        from generate_series(1, 25) g;
    `);
    check(await claim(ADMIN, [FIRM, CLIENT, 25]) === "client-limit-reached",
      "pool: the advertised 25-client cap is enforced");
    check(await claim(ADMIN, [FIRM, CLIENT, -1]) === "client-limit-reached",
      "pool: and p_limit = -1 from the caller does NOT lift it",
      "the cap was being read from a number the caller sent — a ₹29,999/mo " +
      "Practice account would fund unlimited client workspaces");
    check(await claim(ADMIN, [FIRM, CLIENT, 999999]) === "client-limit-reached",
      "pool: nor does an absurdly large one");
    check(await linkOf(CLIENT) === null,
      "pool: and the over-cap client is still unlinked");

    /* (5) A caller may still be STRICTER than the plan — the one direction
           that is safe, and the reason the parameter was kept. */
    await db.exec(`delete from organizations where name like 'C%' and practice_org_id = '${FIRM}';`);
    check(await claim(ADMIN, [FIRM, CLIENT, 0]) === "client-limit-reached",
      "pool: a caller asking for a tighter cap than the plan is honoured");
  }

  /* ----------------------------------------------------------------- report */
  console.log(`\nbilling guard: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log(`  ${listed.size} protected columns, each attack attempted for real on Postgres.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
