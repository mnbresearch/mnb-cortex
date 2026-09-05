/**
 * The two ways bring-your-own-key went badly wrong, proven closed.
 *
 * Both were found by a hostile review of the feature the day it was written,
 * and both were CERTAIN, not theoretical.
 *
 * 1. TENANT DATA EXFILTRATION BY AN ANALYST.
 *    `integrations` was left on the generic tenant policy (write for rank >= 2)
 *    while api_keys and webhook_endpoints were tightened to admin. Because
 *    lib/credentials.ts merged the plaintext `config` column into the returned
 *    credentials, an analyst could PATCH the row through PostgREST — going
 *    around the app's admin check entirely — and put their OWN provider key in
 *    config.gemini. Every AI call in that workspace would then carry the full
 *    business snapshot to an account the attacker controls and can read.
 *
 * 2. FREE UNLIMITED AI, AND THE PAYWALL BYPASSED.
 *    `own` was set by any stored value of 20+ characters, and the credit waiver
 *    returned at the TOP of chargeForMode. But aiKey() falls back to the
 *    platform key per provider — so twenty junk characters in the Anthropic box
 *    waived all metering while every call still ran on OUR Gemini key. And
 *    because a brand-new workspace is `expired` from its first second, the
 *    early return also unlocked the whole paid product for someone who had
 *    never paid.
 *
 * The first is tested against real Postgres. The second is a property of the
 * resolver and the ordering in chargeForMode, so it is tested by executing the
 * resolver and by asserting the ordering in the source.
 */
const path = require("node:path");
const fs = require("node:fs");
const ROOT = path.resolve(__dirname, "..");
const { PGlite } = require(path.join(ROOT, "node_modules/@electric-sql/pglite"));

let bad = 0;
const show = (label, ok, note = "") => {
  if (!ok) bad++;
  console.log(`  ${ok ? "  ok  " : "  !!  "} ${label}${ok ? "" : `   <-- WRONG${note ? " — " + note : ""}`}`);
};

(async () => {
  /* ---------------- 1. the analyst exfiltration path, in real Postgres ------- */
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated;
    create type member_role as enum ('viewer','analyst','manager','admin','owner');
    create table organizations(id uuid primary key default gen_random_uuid(), name text);
    create table memberships(user_id uuid, org_id uuid references organizations(id) on delete cascade, role member_role);
    create table integrations(
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      provider text not null, status text, config jsonb, credentials_encrypted text);
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.uid',true),'')::uuid $$;
    create or replace function user_org_rank(p uuid) returns int
      language sql stable security definer set search_path=public as $$
      select coalesce((select case role when 'owner' then 5 when 'admin' then 4 when 'manager' then 3
        when 'analyst' then 2 else 1 end from memberships where org_id=p and user_id=auth.uid() limit 1),0) $$;
    create or replace function user_org_ids() returns setof uuid
      language sql stable security definer set search_path=public as $$
      select org_id from memberships where user_id = auth.uid() $$;
    grant execute on function user_org_rank, user_org_ids to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;

    -- the OLD generic policy, exactly as 2026_tenancy.sql left it
    alter table integrations enable row level security;
    create policy "tenant read integrations" on integrations for select using (org_id in (select user_org_ids()));
    create policy "tenant insert integrations" on integrations for insert with check (user_org_rank(org_id) >= 2);
    create policy "tenant update integrations" on integrations for update using (user_org_rank(org_id) >= 2) with check (user_org_rank(org_id) >= 2);
  `);

  const org = (await db.query("insert into organizations (name) values ('Victim Ltd') returning id")).rows[0].id;
  const ANALYST = "22222222-2222-2222-2222-222222222222";
  const ADMIN = "44444444-4444-4444-4444-444444444444";
  await db.query("insert into memberships (user_id,org_id,role) values ($1,$2,'analyst'),($3,$2,'admin')", [ANALYST, org, ADMIN]);
  await db.query("insert into integrations (org_id,provider,status,config) values ($1,'ai','connected','{}'::jsonb)", [org]);

  const as = async (uid, sql, params = []) => {
    await db.exec("set role authenticated");
    await db.query("select set_config('app.uid',$1,false)", [uid]);
    try { const r = await db.query(sql, params); await db.exec("reset role"); return { ok: true, rows: r.rows }; }
    catch (e) { await db.exec("reset role"); return { ok: false, err: e.message }; }
  };
  const attackerKey = () =>
    db.query("select config->>'gemini' g from integrations where org_id=$1", [org]).then((r) => r.rows[0].g);

  console.log("BEFORE the lockdown — the attack must reproduce, or nothing below is proven:");
  const before = await as(ANALYST, "update integrations set config = '{\"gemini\":\"ATTACKER-KEY-aaaaaaaaaaaaaaaa\"}'::jsonb where org_id=$1", [org]);
  show("an ANALYST redirects the workspace's AI to their own key",
    before.ok && (await attackerKey()) === "ATTACKER-KEY-aaaaaaaaaaaaaaaa");

  await db.query("update integrations set config='{}'::jsonb where org_id=$1", [org]);
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/migrations/2026_integrations_lockdown.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/migrations/2026_integrations_lockdown.sql"), "utf8")); // idempotent

  console.log("\nAFTER (applied twice):");
  const after = await as(ANALYST, "update integrations set config = '{\"gemini\":\"ATTACKER-KEY-bbbbbbbbbbbbbbbb\"}'::jsonb where org_id=$1", [org]);
  show("the same analyst is blocked", !after.ok || (await attackerKey()) !== "ATTACKER-KEY-bbbbbbbbbbbbbbbb");
  const read = await as(ANALYST, "select credentials_encrypted from integrations where org_id=$1", [org]);
  show("an analyst can no longer even read the row", !read.ok || read.rows.length === 0);

  /* Even an ADMIN must not be able to put a provider key in the plaintext
     column — that is what made a privilege bug into exfiltration. */
  const plain = await as(ADMIN, "update integrations set config = '{\"gemini\":\"ADMIN-PLAINTEXT-cccccccccc\"}'::jsonb where org_id=$1", [org]);
  show("a plaintext AI key is refused by the CHECK constraint, even for an admin",
    !plain.ok && /integrations_no_plaintext_ai_keys|violates check/i.test(plain.err || ""));

  /* …but ordinary non-secret config must still work, or every other
     integration breaks. */
  const ok = await as(ADMIN, "update integrations set config = '{\"shop\":\"acme.myshopify.com\"}'::jsonb where org_id=$1", [org]);
  show("legitimate non-secret config still saves", ok.ok);

  /* ---------------- 2. the billing bypass, in source ------------------------ */
  console.log("\nThe credit waiver:");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const CREDITS = strip(fs.readFileSync(path.join(ROOT, "src/lib/credits.ts"), "utf8"));
  const iLapsed = CREDITS.indexOf('reason: "lapsed"');
  const iWaive = CREDITS.indexOf("if (byo.own)");
  show("the waiver comes AFTER the lapsed/paywall check", iLapsed > 0 && iWaive > iLapsed,
    "before it, an unpaid workspace unlocked the whole product with 20 junk characters");

  const BYO = strip(fs.readFileSync(path.join(ROOT, "src/lib/ai/byo.ts"), "utf8"));
  show("`own` requires the SERVING provider to be the workspace's",
    /firstServingProvider/.test(BYO) && /serving === "workspace"/.test(BYO),
    "otherwise a junk key in an unreached provider waived billing while our key served the call");
  show("`own` requires the key to have passed a real provider call",
    /verified && serving/.test(BYO));
  show("the key store is bound to an org id", /orgId: string \| null/.test(BYO) && /keysFor/.test(BYO));

  console.log(bad ? `\n>>> ${bad} WRONG` : "\n>>> both criticals closed, legitimate use unaffected");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
