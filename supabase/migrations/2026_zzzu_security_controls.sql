/*
  SECURITY CONTROLS FOR THE AGENT: SIGNED APPROVALS, STEP-UP MFA, AI REDACTION.

  Three columns on organizations, three on action_proposals. Additive; safe to
  re-run. Run this after deploying the matching code — the code works without
  it (it reads the defaults below when the columns are missing) and becomes
  stricter, not looser, once it is applied.

  ============================================================================
  organizations
  ============================================================================

  require_mfa_high_impact  boolean, default TRUE
      Approving or undoing anything that moves money or contacts a third
      party, giving such an action autonomy, issuing an API key, adding a
      webhook, connecting an integration and approving a collections message
      all require a session verified with a second factor (Supabase aal2).
      See src/lib/strong-auth.ts.

  ai_redaction             text, default 'pii'   ('off' | 'pii' | 'strict')
      What is tokenised before a prompt leaves for an external model.
      pii    — customer, supplier and employee names, emails, phone numbers,
               PAN, GSTIN, Aadhaar, IFSC, account and card numbers
      strict — all of that, plus every rupee amount
      off    — nothing (for a workspace on its own model key that has decided
               the vendor may see everything)
      See src/lib/ai/dlp.ts.

  BOTH ARE PROTECTED by cortex_guard_org_billing(). A workspace owner can
  PATCH their own organizations row through PostgREST (2026_tenancy.sql), so a
  stolen password-only session could otherwise switch MFA off or turn
  redaction off with one request and walk around both controls. The settings
  page writes them with the service role after checking a second factor;
  nothing else may.

  ============================================================================
  action_proposals
  ============================================================================

  approval_sig        HMAC-SHA256 over proposal id, workspace, action, the
                      SHA-256 of the canonical arguments, the approver and
                      the assurance level they approved at.
  approval_args_hash  the SHA-256 the signature covers, kept for display.
  approved_aal        'aal2' | 'aal1' | 'policy' — how the approval was made.

  execute() refuses to run an approved proposal whose signature does not
  verify against the arguments it is about to act on. A row edited between
  approval and execution — by a bug, a migration, or anyone with a database
  session — fails closed instead of running with arguments nobody approved.
*/

alter table organizations add column if not exists require_mfa_high_impact boolean not null default true;
alter table organizations add column if not exists ai_redaction text not null default 'pii';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_ai_redaction_check') then
    alter table organizations add constraint organizations_ai_redaction_check
      check (ai_redaction in ('off', 'pii', 'strict'));
  end if;
end $$;

alter table action_proposals add column if not exists approval_sig text;
alter table action_proposals add column if not exists approval_args_hash text;
alter table action_proposals add column if not exists approved_aal text;

/*
  The guard, widened by two names. Body otherwise identical to
  2026_zzzp_guard_practice_link.sql (same SECURITY INVOKER, same message and
  errcode, which scripts/test-billing-guard.mjs asserts on).
*/
create or replace function cortex_guard_org_billing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  protected constant text[] := array[
    'credits',              -- the balance itself
    'credits_allowance',    -- -1 here disables metering entirely
    'credits_reset_at',     -- moving this backwards re-triggers the monthly top-up
    'plan',
    'subscription_status',
    'subscription_ends_at',
    'subscription_cycle',
    'subscription_ref',
    'trial_ends_at',
    'autorenew_status',
    'autorenew_next',
    'practice_org_id',      -- whose credits pay, and whose plan entitles
    'referral_code',        -- the key another org's reward is attributed by
    'require_mfa_high_impact', -- switching it off must itself need a second factor
    'ai_redaction'          -- loosening it must itself need a second factor
  ];
  col       text;
  old_json  jsonb := to_jsonb(OLD);
  new_json  jsonb := to_jsonb(NEW);
begin
  -- service_role, postgres, supabase_admin and the migration runner pass freely.
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  foreach col in array protected loop
    if (old_json -> col) is distinct from (new_json -> col) then
      raise exception
        'column "%" on organizations is billing-controlled and cannot be changed by role "%"',
        col, current_user
        using errcode = '42501';   -- insufficient_privilege
    end if;
  end loop;

  return NEW;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'cortex_org_billing_guard'
       and tgrelid = 'public.organizations'::regclass
  ) then
    create trigger cortex_org_billing_guard
      before update on organizations
      for each row execute function cortex_guard_org_billing();
  end if;
end $$;

notify pgrst, 'reload schema';

/* ---------- verify ---------- expect five rows, all true */
select 'organizations.require_mfa_high_impact' as item, exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'require_mfa_high_impact') as ok
union all
select 'organizations.ai_redaction', exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'ai_redaction')
union all
select 'action_proposals.approval_sig', exists (select 1 from information_schema.columns where table_name = 'action_proposals' and column_name = 'approval_sig')
union all
select 'guard protects require_mfa_high_impact', position('require_mfa_high_impact' in pg_get_functiondef('cortex_guard_org_billing'::regproc)) > 0
union all
select 'guard protects ai_redaction', position('''ai_redaction''' in pg_get_functiondef('cortex_guard_org_billing'::regproc)) > 0;
