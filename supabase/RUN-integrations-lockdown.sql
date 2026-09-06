/* ===========================================================================
   MNB CORTEX — section 11: integrations lockdown
   Run this whole file in the Supabase SQL editor. Safe to run more than once.

   WHAT IT CLOSES.

   `integrations` holds credentials and was analyst-writable. Every other
   credential table (api_keys, webhook_endpoints) was tightened to admin in
   2026_rls_privilege_fix.sql; this one was missed and stayed on the generic
   "any member reads, rank >= 2 writes" policy from 2026_tenancy.sql.

   That became critical when bring-your-own AI keys landed, because the AI key
   decides where every prompt in the workspace goes. PostgREST serves these
   tables directly to anyone holding the anon key, and the anon key ships in
   our own browser bundle — so the admin check in /api/integrations is not in
   the path. An analyst, a role we hand to junior staff and to clients in
   Practice mode, could PATCH their own workspace's AI credentials to a
   provider project they control and read every prompt in their own logs.
   Credits would stop being charged, which looks like the feature working.

   WHAT IT DOES.

   Step 1  reports whether any row would block step 3, and stops if so.
   Step 2  puts integrations behind admin-only RLS (rank >= 4), read included.
   Step 3  adds a CHECK refusing plaintext AI keys in the `config` column.
   Step 4  prints a PASS/FAIL table.

   Steps 2-4 are wrapped so a failure rolls back cleanly.
   =========================================================================== */


/* ---------------------------------------------------------------------------
   STEP 1 — PRE-FLIGHT.

   Step 3 uses `alter table ... add constraint`, which validates every existing
   row. If a live workspace already has a plaintext AI key in `config` — the
   exact state the constraint exists to prevent, so not unlikely — the ALTER
   aborts with:

       check constraint "integrations_no_plaintext_ai_keys" of relation
       "integrations" is violated by some row

   which names no row and leaves you guessing. Worse, the RLS in step 2 rolls
   back with it, so you would be left fully exposed while believing the run
   half-worked. This stops first and tells you which workspaces to look at.
   --------------------------------------------------------------------------- */
do $$
declare
  n int;
  orgs text;
begin
  if to_regclass('public.integrations') is null then
    raise notice 'integrations table does not exist — nothing to do.';
    return;
  end if;

  select count(*), coalesce(string_agg(distinct org_id::text, ', '), '')
    into n, orgs
  from integrations
  where provider = 'ai'
    and config ?| array['gemini', 'openai', 'anthropic', 'groq',
                        'GEMINI_API_KEY', 'OPENAI_API_KEY',
                        'ANTHROPIC_API_KEY', 'GROQ_API_KEY'];

  if n > 0 then
    raise exception using
      errcode = '23514',
      message = format('PRE-FLIGHT STOP: %s integrations row(s) hold a plaintext AI key in config.', n),
      detail  = format('Affected org_id(s): %s', orgs),
      hint    = 'These keys have been readable by every analyst in those '
                'workspaces, so treat them as compromised: rotate them at the '
                'provider first. Then clear them with '
                '"update integrations set config = config - ''gemini'' - ''openai'' '
                '- ''anthropic'' - ''groq'' - ''GEMINI_API_KEY'' - ''OPENAI_API_KEY'' '
                '- ''ANTHROPIC_API_KEY'' - ''GROQ_API_KEY'' where provider = ''ai'';" '
                'and re-run this file. The affected workspaces will fall back to '
                'the platform key and can re-enter their key through /connect, '
                'which stores it encrypted.';
  end if;

  raise notice 'Pre-flight clean — no plaintext AI keys found.';
end $$;


/* ---------------------------------------------------------------------------
   STEP 1b — DROP EVERY POLICY THIS SCRIPT DOES NOT OWN.

   The first run of this script reported "5 policies found" where it creates
   four, and separately "4 of 4 require rank >= 4". Those two facts together
   mean a fifth policy existed that required neither.

   It came from `supabase/migration_integrations.sql`, which predates the rank
   system and created two policies under names this script never dropped:

       "tenant integrations"        for all, any member of the workspace
       "admin manage integrations"  for all, role in ('admin','owner')

   PERMISSIVE policies are OR'd. "tenant integrations" grants SELECT, INSERT,
   UPDATE and DELETE to ANY MEMBER — viewer and analyst included — which is
   exactly the access this file exists to remove. Alongside it the four
   admin-only policies did nothing at all. The run reported success and the
   exfiltration path stayed open.

   Dropping by exclusion instead of by name. This table holds credentials; it
   should carry these four policies and nothing else, whatever an older
   migration named its own. Each drop is announced in the Messages/Notices tab.
   --------------------------------------------------------------------------- */
do $$
declare
  p record;
  n int := 0;
  expected text[] := array[
    'tenant read integrations', 'tenant insert integrations',
    'tenant update integrations', 'tenant delete integrations'];
begin
  if to_regclass('public.integrations') is null then return; end if;

  for p in
    select policyname, permissive, cmd, roles::text as roles
    from pg_policies
    where schemaname = 'public' and tablename = 'integrations'
      and not (policyname = any(expected))
  loop
    n := n + 1;
    raise notice 'DROPPING unexpected policy: "%" (%, cmd=%, roles=%)',
      p.policyname, p.permissive, p.cmd, p.roles;
    execute format('drop policy if exists %I on integrations;', p.policyname);
  end loop;

  if n = 0 then
    raise notice 'No stray policies — nothing to drop.';
  else
    raise notice 'Dropped % stray policy/policies. If any was PERMISSIVE and '
                 'broadly scoped, the previous lockdown was not in effect.', n;
  end if;
end $$;


/* ---------------------------------------------------------------------------
   STEP 2 — ADMIN-ONLY RLS.

   Read is included deliberately. `credentials_encrypted` and the masked hint
   both live on this row; the ciphertext is inert, but there is no reason to
   hand it to a viewer for offline attack. The application already requires
   admin here, so nothing legitimate changes — this makes the database agree
   with the app rather than trusting the app to be the only caller.
   --------------------------------------------------------------------------- */
do $$
declare t text;
begin
  foreach t in array array['integrations'] loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists "tenant read %1$s" on %1$I;', t);
    execute format($f$create policy "tenant read %1$s" on %1$I for select
      using (user_org_rank(org_id) >= 4);$f$, t);

    execute format('drop policy if exists "tenant insert %1$s" on %1$I;', t);
    execute format($f$create policy "tenant insert %1$s" on %1$I for insert
      with check (user_org_rank(org_id) >= 4);$f$, t);

    execute format('drop policy if exists "tenant update %1$s" on %1$I;', t);
    execute format($f$create policy "tenant update %1$s" on %1$I for update
      using (user_org_rank(org_id) >= 4) with check (user_org_rank(org_id) >= 4);$f$, t);

    execute format('drop policy if exists "tenant delete %1$s" on %1$I;', t);
    execute format($f$create policy "tenant delete %1$s" on %1$I for delete
      using (user_org_rank(org_id) >= 4);$f$, t);
  end loop;
end $$;


/* ---------------------------------------------------------------------------
   STEP 3 — NO PLAINTEXT AI KEYS.

   The RLS above is the control; this is the second line, because the first
   line failed once already. `config` is plaintext jsonb, and the only reason
   the attack worked is that lib/credentials.ts was willing to read a secret
   out of it. A CHECK cannot know which field names are secret in general, but
   it can refuse the specific ones that decide where a workspace's prompts go —
   which is what turns a privilege bug into data exfiltration.

   Scoped to provider = 'ai' on purpose. A field called "gemini" on some other
   provider's row is not this attack, and refusing it would be surprising.
   --------------------------------------------------------------------------- */
do $$
begin
  if to_regclass('public.integrations') is null then return; end if;

  alter table integrations drop constraint if exists integrations_no_plaintext_ai_keys;
  alter table integrations add constraint integrations_no_plaintext_ai_keys
    check (
      provider <> 'ai'
      or config is null
      or not (config ?| array['gemini', 'openai', 'anthropic', 'groq',
                              'GEMINI_API_KEY', 'OPENAI_API_KEY',
                              'ANTHROPIC_API_KEY', 'GROQ_API_KEY'])
    );
end $$;

comment on column integrations.config is
  'NON-SECRET fields only, in plaintext, for display. Secrets go in '
  'credentials_encrypted (AES-256-GCM). lib/credentials.ts must not read a '
  'secret-named field out of here — see 2026_integrations_lockdown.sql for the '
  'exfiltration path that made this a constraint rather than a convention.';


/* ---------------------------------------------------------------------------
   STEP 4 — VERIFY.

   Paste the output back. Every row must read OK. A verification block that can
   only print OK is worth nothing, so each check below is a real comparison
   against pg_catalog, not a restatement of what the script above intended.
   --------------------------------------------------------------------------- */
select
  check_name,
  case when ok then 'OK' else 'FAIL' end as result,
  detail
from (
  select
    '1. RLS enabled on integrations' as check_name,
    coalesce((select relrowsecurity from pg_class where relname = 'integrations'), false) as ok,
    coalesce((select relrowsecurity::text from pg_class where relname = 'integrations'), 'table missing') as detail
  union all
  select
    '2. Exactly 4 policies',
    (select count(*) from pg_policies where tablename = 'integrations') = 4,
    (select count(*)::text || ' found' from pg_policies where tablename = 'integrations')
  union all
  select
    '3. No policy still allows rank >= 2',
    not exists (
      select 1 from pg_policies
      where tablename = 'integrations'
        and (coalesce(qual, '') like '%>= 2%' or coalesce(with_check, '') like '%>= 2%')),
    coalesce((select string_agg(policyname, ', ') from pg_policies
      where tablename = 'integrations'
        and (coalesce(qual, '') like '%>= 2%' or coalesce(with_check, '') like '%>= 2%')), 'none')
  union all
  /*
    Compared against the TOTAL, not against a hardcoded 4.

    This is what hid the bypass last time. The old version counted policies
    matching ">= 4", found four, compared it to the literal 4 and printed
    "4 of 4 — OK" while a fifth policy granting any member full access sat
    right beside it. The check could not fail for the reason that mattered:
    a stray policy adds to the total but not to the match count, so only a
    total-vs-matched comparison notices it.
  */
  select
    '4. EVERY policy requires rank >= 4 (none exempt)',
    (select count(*) from pg_policies where tablename = 'integrations')
      = (select count(*) from pg_policies
         where tablename = 'integrations'
           and (coalesce(qual, '') like '%>= 4%' or coalesce(with_check, '') like '%>= 4%')),
    (select
       (select count(*)::text from pg_policies where tablename = 'integrations'
          and (coalesce(qual, '') like '%>= 4%' or coalesce(with_check, '') like '%>= 4%'))
       || ' of '
       || (select count(*)::text from pg_policies where tablename = 'integrations'))
  union all
  /* Name the offenders outright, so a FAIL says which policy to look at. */
  select
    '4b. No policy outside the expected four',
    not exists (
      select 1 from pg_policies where tablename = 'integrations'
        and policyname not in ('tenant read integrations', 'tenant insert integrations',
                               'tenant update integrations', 'tenant delete integrations')),
    coalesce((select string_agg(policyname || ' [' || permissive || ', ' || cmd || ']', '; ')
      from pg_policies where tablename = 'integrations'
        and policyname not in ('tenant read integrations', 'tenant insert integrations',
                               'tenant update integrations', 'tenant delete integrations')),
      'none')
  union all
  select
    '5. Plaintext-AI-key CHECK exists',
    exists (select 1 from pg_constraint where conname = 'integrations_no_plaintext_ai_keys'),
    coalesce((select 'validated=' || convalidated::text from pg_constraint
      where conname = 'integrations_no_plaintext_ai_keys'), 'absent')
  union all
  select
    '6. No plaintext AI keys remain',
    not exists (
      select 1 from integrations
      where provider = 'ai'
        and config ?| array['gemini','openai','anthropic','groq',
                            'GEMINI_API_KEY','OPENAI_API_KEY',
                            'ANTHROPIC_API_KEY','GROQ_API_KEY']),
    (select count(*)::text || ' offending row(s)' from integrations
      where provider = 'ai'
        and config ?| array['gemini','openai','anthropic','groq',
                            'GEMINI_API_KEY','OPENAI_API_KEY',
                            'ANTHROPIC_API_KEY','GROQ_API_KEY'])
) t
order by check_name;
