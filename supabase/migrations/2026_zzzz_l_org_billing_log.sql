/*
  2026_zzzz_l_org_billing_log.sql — the super-admin billing audit trail.

  org_billing_log is created by 2026_credits.sql, but it is not present on the
  production database (found 1 Nov 2026 when a query against it failed with
  42P01). manageOrg() writes one row per plan / status / credits / allowance
  change made from the super-admin console — before and after values and who
  did it — and has been logging "insert failed" and carrying on, so none of
  those changes has been recorded. For Enterprise accounts, whose plan and
  allowance are set by hand, that record is the audit trail.

  Same definition and policy as 2026_credits.sql + 2026_hardening.sql:
  members may READ their own workspace's rows; only the service role writes.
  Idempotent.
*/
create table if not exists org_billing_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  actor text,
  action text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_org_billing_log_org on org_billing_log(org_id, created_at desc);

alter table org_billing_log enable row level security;
drop policy if exists "tenant read org_billing_log" on org_billing_log;
create policy "tenant read org_billing_log" on org_billing_log
  for select using (org_id in (select user_org_ids()));
revoke insert, update, delete on org_billing_log from anon, authenticated;

-- verify: expect  t | 1 | 0
select
  to_regclass('public.org_billing_log') is not null                                        as table_exists,
  (select count(*) from pg_policies where tablename = 'org_billing_log')                    as policies,
  (select count(*) from information_schema.role_table_grants
     where table_name = 'org_billing_log' and grantee in ('anon','authenticated')
       and privilege_type in ('INSERT','UPDATE','DELETE'))                                   as tenant_write_grants;
