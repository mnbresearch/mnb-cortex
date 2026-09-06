/* ===========================================================================
   DIAGNOSTIC ONLY — names the account that exists in both products.
   Changes nothing. Safe to run.

   Check 6 came back REVIEW: one user id appears both in `memberships` (an MNB
   Cortex workspace) and as an `owner_id` in the other product.

   The expected explanation is that it is YOU — you built and operate both, so
   your own account naturally sits on both sides. Worth confirming by name
   rather than assuming, because the alternative reading is the one that
   matters: a real customer of one product who has silently acquired an account
   in the other.

   If the address below is yours, there is nothing to fix. If it belongs to a
   customer, that is a genuine finding and we should trace how it happened.
   =========================================================================== */

select
  u.email,
  u.created_at                                                as account_created,
  (select count(*) from memberships m where m.user_id = u.id) as cortex_workspaces,
  (select count(*) from students  s where s.owner_id = u.id)  as student_rows,
  (select count(*) from teachers  t where t.owner_id = u.id)  as teacher_rows,
  (select string_agg(o.name, ', ')
     from memberships m
     join organizations o on o.id = m.org_id
    where m.user_id = u.id)                                   as cortex_workspace_names
from auth.users u
where u.id in (
  select m.user_id
    from memberships m
   where m.user_id in (
     select owner_id from students where owner_id is not null
     union
     select owner_id from teachers where owner_id is not null
   )
)
order by u.created_at;
