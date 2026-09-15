/* ===========================================================================
   WHOSE CALENDAR IS IT? — one jsonb column, six self-declared answers.

   WHAT THIS IS FOR

   lib/statutory.ts holds nineteen Indian statutory rules and shows all of them
   to every workspace, because Cortex is never told whether a business is
   GST-registered, has employees, or deducts TDS. Every deadline therefore
   carries an "applies if …" condition in words, which is honest and also
   means the owner re-reads nineteen conditions every month to find their
   four.

   For an early-warning product that is the wrong trade: noise is not a
   side-effect of caution, it is the failure mode. An owner who has learned
   that most lines are not theirs skims the page, and skims past the one that
   is.

   Six answers, given once, turn the national calendar into theirs.

   WHY jsonb ON organizations RATHER THAN A TABLE

   It is exactly one row per workspace, read on nearly every compliance render
   and never queried across workspaces or aggregated. A table would add a join
   to a hot path to model a one-to-one. `accent`, `logo_url` and the other
   per-workspace settings already live on this row.

   WHY EVERY FIELD DEFAULTS TO ABSENT, NOT TO A GUESS

   An empty object means "they have told us nothing", and
   lib/statutory-profile.ts treats every unknown field as SHOW. So running
   this migration changes nothing about what anybody sees until they answer —
   and a workspace that never answers is no worse off than before. Nothing is
   ever hidden by inference from their industry, their turnover or their data.

   Safe to run, and safe to run twice.
   =========================================================================== */

alter table organizations
  add column if not exists statutory_profile jsonb not null default '{}'::jsonb;

/*
  A CHECK rather than an enum, because the shape is read by TypeScript that
  already decays anything unrecognised to "unknown" (parseProfile). The
  constraint is here to stop a typo being stored at all — a stored "montly"
  would read as unknown and silently show every GST deadline, which is safe
  but confusing to debug.

  Nulls are permitted per key: an absent key IS the unknown case.

  EVERY CLAUSE IS PARENTHESISED. This is not style.

  I first wrote the gst clause without its brackets:

      (…->>'gst') is null or (…->>'gst') in (…) and (…employees…) and …

  SQL binds AND tighter than OR, so that parses as

      gst_is_null OR (gst_valid AND employees_valid AND … )

  — which means the entire constraint is satisfied by `gst` simply being
  absent. A workspace that never answered the GST question could then store
  any rubbish at all in the other five keys, and the constraint whose only job
  is to stop that would have passed it. It would also have looked like it
  worked in testing, because the obvious thing to test is a bad `gst` value,
  and that one case is the only one the broken version still caught.

  scripts/test-statutory-profile.mjs asserts the bracketing directly, since a
  constraint that silently accepts everything is invisible until it matters.
*/
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_statutory_profile_shape'
  ) then
    alter table organizations add constraint organizations_statutory_profile_shape check (
          ((statutory_profile->>'gst')       is null or (statutory_profile->>'gst')       in ('none','monthly','qrmp','unknown'))
      and ((statutory_profile->>'employees') is null or (statutory_profile->>'employees') in ('yes','no','unknown'))
      and ((statutory_profile->>'tds')       is null or (statutory_profile->>'tds')       in ('yes','no','unknown'))
      and ((statutory_profile->>'company')   is null or (statutory_profile->>'company')   in ('yes','no','unknown'))
      and ((statutory_profile->>'audit')     is null or (statutory_profile->>'audit')     in ('yes','no','unknown'))
      and ((statutory_profile->>'gstTds')    is null or (statutory_profile->>'gstTds')    in ('yes','no','unknown'))
    );
  end if;
end $$;

/* ---------------------------------------------------------------- verify ---
   Expect: ok | ok | 0
   The third number is workspaces whose profile is non-empty — zero right after
   the migration, which is the point: nothing is assumed on anyone's behalf.
   -------------------------------------------------------------------------- */
select
  case when exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='organizations'
                       and column_name='statutory_profile')
       then 'ok' else 'MISSING' end                                     as profile_column,
  case when exists (select 1 from pg_constraint
                     where conname='organizations_statutory_profile_shape')
       then 'ok' else 'MISSING' end                                     as shape_constraint,
  (select count(*) from organizations where statutory_profile <> '{}'::jsonb) as workspaces_that_have_answered;
