-- Demo workspaces: close the cross-tenant hole.
--
-- 2026_demo_workspaces.sql (as first shipped) created
--   create policy "superadmin manage demo workspaces" ... for all
--   using (exists (select 1 from memberships m ... where m.role = 'owner'))
-- which matches ANY workspace owner — every customer — not super-admins.
-- Effects in production until this runs:
--   * any owner could read every demo prospect's email / name / company;
--   * a demo user could DELETE their own demo_workspaces row (or push
--     expires_at forward) and so escape the compulsory-upgrade lock.
--
-- Provisioning runs through the service role (lib/superadmin-actions.ts),
-- which bypasses RLS, so the fix is to have NO write policy at all.
-- Idempotent: safe to run more than once, and safe if the table is absent.

do $$
begin
  if to_regclass('public.demo_workspaces') is null then
    raise notice 'demo_workspaces does not exist yet — nothing to fix';
    return;
  end if;

  execute 'drop policy if exists "superadmin manage demo workspaces" on public.demo_workspaces';
  execute 'drop policy if exists "members read own demo details" on public.demo_workspaces';
  execute $p$
    create policy "members read own demo details"
      on public.demo_workspaces for select
      using (exists (
        select 1 from public.memberships m
        where m.org_id = demo_workspaces.org_id and m.user_id = auth.uid()
      ))
  $p$;
  execute 'alter table public.demo_workspaces enable row level security';
  execute 'revoke insert, update, delete on public.demo_workspaces from anon, authenticated';
end $$;

-- Verify: expect exactly one policy, a SELECT, and no write grants for tenants.
select
  (select count(*) from pg_policies where tablename = 'demo_workspaces')                         as policies,
  (select string_agg(cmd, ',') from pg_policies where tablename = 'demo_workspaces')             as commands,
  (select count(*) from information_schema.role_table_grants
     where table_name = 'demo_workspaces' and grantee in ('anon','authenticated')
       and privilege_type in ('INSERT','UPDATE','DELETE'))                                        as tenant_write_grants;
-- expect: 1 | SELECT | 0
