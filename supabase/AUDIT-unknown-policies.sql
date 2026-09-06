/* ===========================================================================
   DIAGNOSTIC ONLY — reads pg_policies. Changes nothing. Safe to run.

   Four policies exist in your database that appear in NO migration file in the
   repository:

       payments_all      students_all      teachers_all      attendance_all

   Everything else the audit listed traces back to a migration I can read, so I
   can tell you what it does. These four were created by hand in the Supabase
   console and are not in version control, so I cannot. The naming — a bare
   `_all` suffix, one policy covering every command — is the shape of

       create policy X on T for all using (true);

   which on `payments` would mean any authenticated user reads every workspace's
   payment records. It might equally be properly tenant-scoped. I am not going
   to guess at a payments table.

   This prints their actual definitions. Paste the output back.
   =========================================================================== */

select
  tablename,
  policyname,
  permissive,
  roles::text                    as applies_to,
  cmd                            as command,
  coalesce(qual, '(none)')       as using_clause,
  coalesce(with_check, '(none)') as with_check_clause,
  case
    when coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true'
      then 'OPEN — grants unconditionally'
    when coalesce(qual, '') like '%user_org_ids%'
      or coalesce(qual, '') like '%user_org_rank%'
      or coalesce(qual, '') like '%auth.uid()%'
      then 'scoped'
    else 'review'
  end as verdict
from pg_policies
where schemaname = 'public'
  and policyname in ('payments_all', 'students_all', 'teachers_all', 'attendance_all')
order by tablename;
