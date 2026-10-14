-- ============================================================
-- MNB CORTEX — leads: an UPDATE policy, and a rank-gated DELETE.
-- Idempotent. Non-destructive: replaces policies only, touches no rows.
--
-- 1. "Make customer" (convertLead) marks the lead converted with an UPDATE.
--    There was NO update policy on leads anywhere in the repo's SQL, so under
--    RLS the update matched zero rows with no error: the customer was created
--    and the lead kept offering "Make customer" — a second press made a second
--    customer. Now: manager and above, own workspace only. Platform leads
--    (org_id null, from MNB's own marketing pages) are not updatable by any
--    tenant; the operator console uses the service role.
--
-- 2. DELETE was `org_id in (select user_org_ids())` — any member, including a
--    viewer, could erase the workspace's enquiries, and deleteLead had no role
--    check. Now manager and above, matching every other tenant table
--    (2026_tenancy.sql) and requireRole("manager") in actions.ts.
-- ============================================================

do $$
begin
  if to_regclass('public.leads') is null then
    raise notice 'skipping — table leads does not exist';
    return;
  end if;

  alter table leads enable row level security;

  /* Any older update/delete grants by the other naming convention, which would be OR'd with these. */
  drop policy if exists "tenant update leads" on leads;
  drop policy if exists "tenant delete leads" on leads;

  drop policy if exists "auth update leads" on leads;
  create policy "auth update leads" on leads for update to authenticated
    using (org_id is not null and user_org_rank(org_id) >= 3)
    with check (org_id is not null and user_org_rank(org_id) >= 3);

  drop policy if exists "auth delete leads" on leads;
  create policy "auth delete leads" on leads for delete to authenticated
    using (org_id is not null and user_org_rank(org_id) >= 3);
end $$;

-- Verify: expect "auth update leads" (UPDATE) and "auth delete leads" (DELETE),
-- both referencing user_org_rank(org_id) >= 3, and no FOR ALL policy on leads.
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'leads'
 order by cmd, policyname;
