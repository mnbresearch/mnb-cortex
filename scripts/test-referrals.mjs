/**
 * The referral programme, executed against a real Postgres.
 *
 * This grants money-equivalent value (AI credits) automatically, from a webhook
 * that a third party can deliver more than once. The failure modes are all
 * financial, and none of them are visible by reading the SQL:
 *
 *   - paying twice for the same referral (duplicate webhook, or renewal)
 *   - paying for a workspace that never subscribed
 *   - self-referral
 *   - one workspace being referred by several people
 *   - the `authenticated` role writing its own referral rows
 *
 * So each is attempted for real here. The migration under test is the file that
 * ships, loaded from disk.
 */

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

const db = new PGlite();
const REWARD = 500;

async function main() {
  /* Minimum schema the migration leans on, plus the roles PostgREST uses. */
  await db.exec(`
    create role authenticated; create role anon; create role service_role;

    create table organizations (
      id uuid primary key default gen_random_uuid(),
      name text,
      credits bigint not null default 0
    );
    create table credit_ledger (
      id uuid primary key default gen_random_uuid(),
      org_id uuid, user_id uuid, delta bigint, balance_after bigint,
      reason text, meta jsonb, created_at timestamptz default now()
    );
    -- The real grant_credits, copied from 2026_credit_metering.sql.
    create or replace function grant_credits(p_org uuid, p_amount bigint, p_user uuid, p_reason text, p_meta jsonb)
    returns bigint language plpgsql as $$
    declare cur bigint; nb bigint;
    begin
      select credits into cur from organizations where id = p_org for update;
      if cur is null then cur := 0; end if;
      nb := greatest(cur + p_amount, 0);
      update organizations set credits = nb where id = p_org;
      insert into credit_ledger(org_id, user_id, delta, balance_after, reason, meta)
        values (p_org, p_user, p_amount, nb, p_reason, coalesce(p_meta,'{}'::jsonb));
      return nb;
    end $$;
    create or replace function user_org_ids() returns setof uuid
      language sql stable as $$ select null::uuid where false $$;
    grant select, insert, update on organizations, credit_ledger to authenticated, anon, service_role;
  `);

  await db.exec(readFileSync("supabase/migrations/2026_referrals.sql", "utf8"));
  check(true, "migration applies to a real Postgres");

  const newOrg = async (name) =>
    (await db.query(`insert into organizations (name) values ($1) returning id, referral_code`, [name])).rows[0];
  const credits = async (id) =>
    Number((await db.query(`select credits from organizations where id=$1`, [id])).rows[0].credits);
  const reward = async (id) =>
    Number((await db.query(`select cortex_reward_referral($1,$2) as v`, [id, REWARD])).rows[0].v);

  /* ------------------------------------------------------------- the code */

  const alice = await newOrg("Alice Traders");
  const bob = await newOrg("Bob Industries");

  check(/^MNB-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(alice.referral_code),
    "code: generated on insert, correct shape", `got ${alice.referral_code}`);
  check(alice.referral_code !== bob.referral_code, "code: two workspaces get different codes");
  check(!/[IO01]/.test(alice.referral_code.slice(4)),
    "code: excludes the characters people mistype (I, O, 0, 1)", alice.referral_code);

  /* Uniqueness is enforced, not hoped for. */
  let dupErr = null;
  try {
    await db.query(`update organizations set referral_code=$1 where id=$2`, [alice.referral_code, bob.id]);
  } catch (e) { dupErr = String(e.message || e); }
  check(dupErr !== null, "code: duplicate codes are rejected by the unique index");

  /* ------------------------------------------------------- self-referral */

  let selfErr = null;
  try {
    await db.query(
      `insert into referrals (referrer_org_id, referred_org_id, code) values ($1,$1,$2)`,
      [alice.id, alice.referral_code]);
  } catch (e) { selfErr = String(e.message || e); }
  check(selfErr !== null, "integrity: a workspace cannot refer itself", "the insert succeeded");

  /* ------------------------------------------------- one referrer per org */

  await db.query(`insert into referrals (referrer_org_id, referred_org_id, code) values ($1,$2,$3)`,
    [alice.id, bob.id, alice.referral_code]);

  const carol = await newOrg("Carol Exports");
  let secondErr = null;
  try {
    await db.query(`insert into referrals (referrer_org_id, referred_org_id, code) values ($1,$2,$3)`,
      [carol.id, bob.id, carol.referral_code]);
  } catch (e) { secondErr = String(e.message || e); }
  check(secondErr !== null, "integrity: a workspace can only be referred once, by one person",
    "a second referrer was recorded for the same business");

  /* --------------------------------------------------------- the payout */

  check(await credits(alice.id) === 0, "payout: nothing is granted at signup");
  check(await credits(bob.id) === 0, "payout: the referred side gets nothing at signup either");

  const paid = await reward(bob.id);
  check(paid === REWARD, "payout: subscribing pays out", `returned ${paid}`);
  check(await credits(alice.id) === REWARD, "payout: the referrer received the credits",
    `alice has ${await credits(alice.id)}`);
  check(await credits(bob.id) === REWARD, "payout: the referred business received them too",
    `bob has ${await credits(bob.id)}`);

  /* THE ONE THAT COSTS MONEY: a duplicate webhook, and next month's renewal. */
  const again = await reward(bob.id);
  check(again === 0, "payout: a SECOND call pays nothing", `returned ${again} — duplicate webhooks would pay twice`);
  check(await credits(alice.id) === REWARD, "payout: the referrer's balance did not move",
    `alice now has ${await credits(alice.id)}`);

  const third = await reward(bob.id);
  check(third === 0, "payout: still nothing on a third call (renewals)");

  /* A workspace nobody referred must not pay out. */
  const dave = await newOrg("Dave Foods");
  check(await reward(dave.id) === 0, "payout: an unreferred workspace pays nothing");
  check(await credits(dave.id) === 0, "payout: and receives nothing");

  /* The ledger must show what happened, for both sides. */
  const { rows: ledger } = await db.query(
    `select reason, count(*)::int n from credit_ledger group by reason order by reason`);
  const byReason = Object.fromEntries(ledger.map((r) => [r.reason, r.n]));
  check(byReason.referral_reward === 1, "audit: exactly one referral_reward row", JSON.stringify(byReason));
  check(byReason.referral_bonus === 1, "audit: exactly one referral_bonus row", JSON.stringify(byReason));

  /* -------------------------------------------- not reachable from the browser */

  async function asRole(role, statement, params = []) {
    await db.exec(`set role ${role};`);
    let err = null;
    try { await db.query(statement, params); } catch (e) { err = String(e.message || e); }
    await db.exec(`reset role;`);
    return err;
  }

  const eve = await newOrg("Eve Ltd");
  const forge = await asRole("authenticated",
    `insert into referrals (referrer_org_id, referred_org_id, code) values ($1,$2,$3)`,
    [eve.id, dave.id, eve.referral_code]);
  check(forge !== null, "security: authenticated cannot insert its own referral rows",
    "a user could manufacture referrals and pay themselves");

  const selfPay = await asRole("authenticated",
    `select cortex_reward_referral($1,$2)`, [dave.id, 999999]);
  check(selfPay !== null, "security: authenticated cannot call the payout function",
    "a user could grant themselves arbitrary credits");

  const anonPay = await asRole("anon", `select cortex_reward_referral($1,$2)`, [dave.id, 999999]);
  check(anonPay !== null, "security: anon cannot call the payout function either");

  console.log(`\nreferrals: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log(`  payout is idempotent, self-referral blocked, and the browser cannot write or pay.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
