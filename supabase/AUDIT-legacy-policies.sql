/* ===========================================================================
   DIAGNOSTIC ONLY — reads pg_policies. Changes nothing. Safe to run.

   WHY THIS EXISTS.

   The integrations lockdown reported "5 policies" where it creates four. The
   fifth came from `supabase/migration_integrations.sql`, which predates the
   rank system and named its policy "tenant integrations" (singular, FOR ALL,
   any member of the workspace). Every 2026 migration drops policies BY EXACT
   NAME — "tenant read integrations", "tenant insert integrations" and so on —
   so the legacy name was never touched and survived underneath.

   Permissive policies are OR'd. A surviving "any member, for all commands"
   policy grants everything the new admin-only policies were written to deny,
   and the migration reports success while changing nothing that matters.

   THAT IS UNLIKELY TO BE ONE TABLE. The same pre-rank migrations created:

       "tenant api_keys"      "tenant customers"    "tenant subs"
       "tenant invites"       "tenant report_links" "tenant activity"
       "tenant email_replies" "tenant email_templates"
       "tenant email_campaigns" "tenant campaign_recipients"
       "member update org"    "admin manage integrations"

   `api_keys` and `invites` matter most: 2026_rls_privilege_fix.sql tightened
   api_keys to admin-read (it holds credentials) and invites to rank >= 4 with
   a role ceiling (it was an analyst-to-owner escalation path). If the legacy
   policy survived on either, neither fix is in effect.

   WHAT THIS REPORTS.

   Section A — every policy that does NOT reference user_org_rank. In the 2026
   model, rank is how access is decided, so anything else is either legacy or a
   deliberate exception. Read the `verdict` column.

   Section B — a per-table summary: how many policies, how many rank-gated.

   Run both and paste the output back. Nothing here writes.
   =========================================================================== */

/* ---------------------------------- A ---------------------------------- */
select
  tablename,
  policyname,
  permissive,
  cmd                  as command,
  roles::text          as applies_to,
  case
    /* Deliberate: the public lead-capture form posts with the anon key. It is
       constrained by a with_check on org_id being null, not by rank. */
    when policyname like '%leads%'                      then 'expected — public lead capture'
    /* Legacy singular naming from the pre-rank migrations. */
    when policyname ~ '^tenant [a-z_]+$'                then 'LEGACY — pre-rank, likely a bypass'
    when policyname = 'admin manage integrations'       then 'LEGACY — pre-rank'
    when policyname = 'member update org'               then 'LEGACY — pre-rank'
    when coalesce(qual, '') = 'true'
      or coalesce(with_check, '') = 'true'              then 'OPEN — grants unconditionally'
    else 'review'
  end                  as verdict,
  coalesce(qual, '(none)')       as using_clause,
  coalesce(with_check, '(none)') as with_check_clause
from pg_policies
where schemaname = 'public'
  and coalesce(qual, '')       not like '%user_org_rank%'
  and coalesce(with_check, '') not like '%user_org_rank%'
order by
  case
    when policyname ~ '^tenant [a-z_]+$' then 0
    when policyname in ('admin manage integrations', 'member update org') then 0
    when policyname like '%leads%' then 2
    else 1
  end,
  tablename, policyname;


/* ---------------------------------- B ---------------------------------- */
select
  tablename,
  count(*)                                           as policies,
  count(*) filter (where coalesce(qual, '') like '%user_org_rank%'
                      or coalesce(with_check, '') like '%user_org_rank%') as rank_gated,
  count(*) filter (where not (coalesce(qual, '') like '%user_org_rank%'
                      or coalesce(with_check, '') like '%user_org_rank%')) as not_gated,
  case
    when count(*) = count(*) filter (where coalesce(qual, '') like '%user_org_rank%'
                                       or coalesce(with_check, '') like '%user_org_rank%')
      then 'ok'
    else 'HAS UNGATED POLICIES'
  end as verdict,
  string_agg(
    case when not (coalesce(qual, '') like '%user_org_rank%'
                or coalesce(with_check, '') like '%user_org_rank%')
    then policyname else null end, '; ') as ungated_names
from pg_policies
where schemaname = 'public'
group by tablename
order by
  (count(*) = count(*) filter (where coalesce(qual, '') like '%user_org_rank%'
                                  or coalesce(with_check, '') like '%user_org_rank%')),
  tablename;
