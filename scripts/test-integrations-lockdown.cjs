#!/usr/bin/env node
/**
 * Verify 2026_integrations_lockdown.sql against real Postgres (PGlite).
 *
 * WHY THIS RUNS BEFORE THE USER DOES.
 *
 * This migration adds a CHECK constraint with `alter table ... add constraint`,
 * which VALIDATES EVERY EXISTING ROW. If any live workspace already has a
 * plaintext AI key sitting in `integrations.config` — which is exactly the
 * state the constraint exists to prevent, and therefore not unlikely — the
 * ALTER aborts and takes the whole transaction with it. The operator sees a
 * constraint violation naming a row they cannot see, and the RLS half of the
 * migration silently does not land either.
 *
 * So: prove the happy path applies, prove it is idempotent, and prove the
 * constraint actually bites. Then the delivered script can pre-flight the
 * offending rows and say what to do rather than erroring at the operator.
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

/** Enough of the real schema for the migration to bind against. */
const STUB = `
create table if not exists organizations (id uuid primary key default gen_random_uuid());
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  provider text not null,
  config jsonb,
  credentials_encrypted text,
  status text
);
create or replace function public.user_org_rank(p_org uuid)
returns int language sql stable as $$ select 5 $$;
`;

(async () => {
  const sql = readFileSync(join(ROOT, "supabase/migrations/2026_integrations_lockdown.sql"), "utf8");

  /* ---------------------------------------------------------------- */
  console.log("\nCLEAN DATABASE — the happy path");
  {
    const db = new PGlite();
    await db.exec(STUB);
    let err = null;
    try { await db.exec(sql); } catch (e) { err = e; }
    check(`applies without error${err ? ` (${err.message})` : ""}`, !err);

    /* Idempotence: an operator who is unsure whether it ran must be able to
       run it again. Every statement here is drop-if-exists first, so verify. */
    let err2 = null;
    try { await db.exec(sql); } catch (e) { err2 = e; }
    check(`applies a SECOND time${err2 ? ` (${err2.message})` : ""}`, !err2);

    const pol = await db.query(
      `select policyname, cmd from pg_policies where tablename = 'integrations' order by cmd`);
    check(`four policies exist (got ${pol.rows.length})`, pol.rows.length === 4);

    const rls = await db.query(
      `select relrowsecurity from pg_class where relname = 'integrations'`);
    check("RLS is enabled", rls.rows[0]?.relrowsecurity === true);

    /* The policies must demand rank >= 4 (admin), not the generic >= 2. */
    const defs = await db.query(
      `select qual, with_check from pg_policies where tablename = 'integrations'`);
    const all = JSON.stringify(defs.rows);
    check("every policy requires rank >= 4", !/>= 2/.test(all) && /4/.test(all));

    const con = await db.query(
      `select conname from pg_constraint where conname = 'integrations_no_plaintext_ai_keys'`);
    check("the CHECK constraint exists", con.rows.length === 1);
    await db.close();
  }

  /* ---------------------------------------------------------------- */
  console.log("\nTHE CONSTRAINT MUST ACTUALLY BITE");
  {
    const db = new PGlite();
    await db.exec(STUB);
    await db.exec(sql);
    const org = "11111111-1111-1111-1111-111111111111";

    const rejects = async (label, provider, config) => {
      let threw = false;
      try {
        await db.query(`insert into integrations (org_id, provider, config) values ($1, $2, $3)`,
                       [org, provider, config]);
      } catch { threw = true; }
      check(label, threw);
    };
    const accepts = async (label, provider, config) => {
      let threw = null;
      try {
        await db.query(`insert into integrations (org_id, provider, config) values ($1, $2, $3)`,
                       [org, provider, config]);
      } catch (e) { threw = e; }
      check(`${label}${threw ? ` (${threw.message})` : ""}`, !threw);
    };

    await rejects("a plaintext gemini key is refused", "ai", JSON.stringify({ gemini: "AIzaSyFAKE" }));
    await rejects("...openai too", "ai", JSON.stringify({ openai: "sk-FAKE" }));
    await rejects("...anthropic too", "ai", JSON.stringify({ anthropic: "sk-ant-FAKE" }));
    await rejects("...and the SCREAMING_CASE variants", "ai", JSON.stringify({ GEMINI_API_KEY: "x" }));

    await accepts("non-secret config on an ai row is fine", "ai",
                  JSON.stringify({ serving: "workspace", verified: true }));
    await accepts("a null config is fine", "ai", null);
    /* The constraint is scoped to provider='ai'. A field called "gemini" on some
       other provider's row is not the exfiltration path, and blocking it would
       be surprising. Pinning the scope so a future widening is deliberate. */
    await accepts("another provider is out of scope", "slack",
                  JSON.stringify({ gemini: "not-a-key" }));
    await db.close();
  }

  /* ---------------------------------------------------------------- */
  console.log("\nDIRTY DATABASE — the case that would abort the operator's run");
  {
    const db = new PGlite();
    await db.exec(STUB);
    const org = "22222222-2222-2222-2222-222222222222";
    await db.query(`insert into integrations (org_id, provider, config) values ($1, 'ai', $2)`,
                   [org, JSON.stringify({ gemini: "AIzaSyPREEXISTING" })]);

    let err = null;
    try { await db.exec(sql); } catch (e) { err = e; }
    check("a pre-existing plaintext key DOES abort the migration", !!err);
    console.log(`        → ${err ? err.message.split("\n")[0] : "no error"}`);

    /* This is the whole reason for the pre-flight in the delivered script. */
    const q = await db.query(`
      select count(*)::int as n from integrations
      where provider = 'ai' and config ?| array['gemini','openai','anthropic','groq',
        'GEMINI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GROQ_API_KEY']`);
    check("the pre-flight query finds it", q.rows[0].n === 1);
    await db.close();
  }

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
