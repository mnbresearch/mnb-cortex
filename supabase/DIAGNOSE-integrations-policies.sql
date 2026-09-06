/* ===========================================================================
   DIAGNOSTIC ONLY — reads pg_policies, changes nothing. Safe to run.

   The lockdown verification reported 5 policies on `integrations` where the
   script creates 4, and separately reported that only 4 require rank >= 4.
   So there is a fifth policy that my script neither created nor dropped —
   it drops by exact name ("tenant read integrations" and so on), so anything
   named differently survived.

   This matters because PERMISSIVE policies are OR'd together. If the fifth is
   permissive and its USING clause is broad, it grants access on its own and
   the four admin-only policies are decoration. A RESTRICTIVE policy is AND'd
   instead and would be harmless, or even an additional control.

   `roles` matters too: a policy scoped to `service_role` or `postgres` is not
   reachable with the anon key that ships in the browser bundle, so it is a
   different risk from one scoped to `public` or `authenticated`.

   Run this and paste the whole output back.
   =========================================================================== */

select
  policyname,
  /* PERMISSIVE grants on its own (OR). RESTRICTIVE only narrows (AND). */
  permissive,
  /* Who it applies to. {public} on a credentials table is the alarming one. */
  roles::text          as applies_to,
  cmd                  as command,
  coalesce(qual, '(none)')       as using_clause,
  coalesce(with_check, '(none)') as with_check_clause,
  /* Flag the four the lockdown script owns, so the stray one is obvious. */
  case when policyname in (
    'tenant read integrations', 'tenant insert integrations',
    'tenant update integrations', 'tenant delete integrations'
  ) then '' else '   <<< NOT CREATED BY THE LOCKDOWN SCRIPT' end as note
from pg_policies
where tablename = 'integrations'
order by
  case when policyname like 'tenant %' then 1 else 0 end,  -- stray first
  cmd, policyname;
