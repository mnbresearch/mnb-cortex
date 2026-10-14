/* ===========================================================================
   2026_zzzz_h_statutory_profile_composition.sql — the composition answer.

   lib/statutory-profile.ts gains a seventh self-declared answer,
   `composition` (yes / no / unknown): is the workspace registered under the
   GST composition scheme? Without it CMP-08 and GSTR-4 could never read as
   "applies" — the best the calendar could say was "check" — and a
   composition dealer kept seeing the monthly GSTR-1 / GSTR-3B they do not
   file.

   NO COLUMN CHANGE IS NEEDED. The profile is the existing jsonb column
   organizations.statutory_profile (2026_zzzf_statutory_profile.sql), and an
   absent key already means "unknown", which shows everything. This file only
   adds the same typo guard the other six keys have, as a SEPARATE constraint
   so nothing existing is dropped or rewritten:

     composition is absent, or one of 'yes', 'no', 'unknown'.

   Every existing row passes it (none has the key yet). Idempotent: the
   constraint is added only if it is not already there. Non-destructive: no
   data is touched.
   =========================================================================== */

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_statutory_profile_composition'
  ) then
    alter table organizations add constraint organizations_statutory_profile_composition check (
      ((statutory_profile->>'composition') is null or (statutory_profile->>'composition') in ('yes','no','unknown'))
    );
  end if;
end $$;

/* ---------------------------------------------------------------- verify ---
   Expect: ok | ok | 0
   -------------------------------------------------------------------------- */
select
  case when exists (select 1 from pg_constraint
                     where conname='organizations_statutory_profile_shape')
       then 'ok' else 'MISSING (run 2026_zzzf_statutory_profile.sql first)' end as shape_constraint,
  case when exists (select 1 from pg_constraint
                     where conname='organizations_statutory_profile_composition')
       then 'ok' else 'MISSING' end                                          as composition_constraint,
  (select count(*) from organizations
    where (statutory_profile->>'composition') is not null
      and (statutory_profile->>'composition') not in ('yes','no','unknown'))  as invalid_composition_values;
