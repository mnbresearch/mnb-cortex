/*
  CRITICAL — `integrations` holds credentials and was analyst-writable.

  THE HOLE.

  2026_rls_privilege_fix.sql tightened `api_keys` and `webhook_endpoints` to
  admin, on the reasoning that a row holding a credential is a permission and
  the generic "analyst can write" default is wrong for it. `integrations` is the
  same kind of table and was not in that list — it stayed on the generic policy
  from 2026_tenancy.sql: SELECT for any member, INSERT/UPDATE for rank >= 2.

  That was survivable while integrations held third-party tokens. It stopped
  being survivable when bring-your-own AI keys landed, because the AI key
  decides WHERE EVERY PROMPT IN THE WORKSPACE GOES.

  THE ATTACK, which needs no admin rights and no encryption key.

  lib/credentials.ts merges the plaintext `config` column into the credentials
  it returns, and lib/ai/byo.ts reads the provider keys straight out of that.
  So an analyst — a role we hand to junior staff, and in Practice mode to
  clients — can go around the app entirely:

      PATCH /rest/v1/integrations?org_id=eq.<their own org>&provider=eq.ai
      { "config": { "gemini": "<a key the attacker owns>" },
        "credentials_encrypted": null, "status": "connected" }

  From that moment every AI call in the workspace — chat, Deep Dive, the weekly
  brief, the dashboard pulse — carries the business's full financial snapshot to
  a provider project the attacker controls and can read in their own logs. The
  workspace sees nothing: credits stop being charged, which looks like the BYO
  feature working correctly.

  The admin check in /api/integrations is not in this path. PostgREST serves
  these tables directly to anyone holding the anon key, and the anon key ships
  in our own browser bundle.

  A viewer could also read `credentials_encrypted` — inert ciphertext, but there
  is no reason to hand it out for offline attack — and any analyst could null
  the row to force the workspace quietly back onto our key.

  THE FIX.

  Same treatment the other two credential tables got: reading or writing a
  credential is an admin action. The application already requires admin here, so
  nothing legitimate changes; this makes the database agree with the app.
*/

do $$
declare t text;
begin
  foreach t in array array['integrations'] loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('alter table %I enable row level security;', t);

    /*
      Read included. `credentials_encrypted` and the masked `hint` both live on
      this row, and a viewer has no business with either.
    */
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

/*
  ---------------------------------------------------------------------------
  Belt and braces: a provider key must never be readable in plaintext.

  The RLS above is the control. This is the second line, because the first one
  failed once already: `config` is a plaintext jsonb column, and the ONLY reason
  the attack above worked is that lib/credentials.ts was willing to read a
  secret out of it.

  Secrets belong in `credentials_encrypted`. A CHECK constraint cannot know
  which field names are secret in general, but it can refuse the specific ones
  that decide where a workspace's prompts go — which is the case that turns a
  privilege bug into data exfiltration.
*/
do $$
begin
  if to_regclass('public.integrations') is null then return; end if;

  alter table integrations drop constraint if exists integrations_no_plaintext_ai_keys;
  alter table integrations add constraint integrations_no_plaintext_ai_keys
    check (
      provider <> 'ai'
      or config is null
      or not (config ?| array['gemini', 'openai', 'anthropic', 'groq',
                              'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY'])
    );
end $$;

comment on column integrations.config is
  'NON-SECRET fields only, in plaintext, for display. Secrets go in '
  'credentials_encrypted (AES-256-GCM). lib/credentials.ts must not read a '
  'secret-named field out of here — see 2026_integrations_lockdown.sql for the '
  'exfiltration path that made this a constraint rather than a convention.';
