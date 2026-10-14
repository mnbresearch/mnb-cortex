-- ============================================================
-- MNB CORTEX — memberships: an admin may not change an OWNER's row.
-- Idempotent. Non-destructive: replaces one policy, touches no rows.
--
-- /admin can now change a member's role and remove a member
-- (changeMemberRole / removeMember in src/lib/actions.ts). The app refuses to
-- let an admin act on an owner, and the database must agree.
--
-- 2026_rls_privilege_fix.sql already stops an admin DELETING an owner and
-- stops anyone below owner SETTING role = 'owner'. But "admins update members"
-- checked only the NEW row: `using (user_org_rank(org_id) >= 4)`. So an admin
-- could UPDATE an owner's row to role = 'viewer' — demoting an owner — as long
-- as another owner remained (the last-owner trigger only protects the last
-- one). That is the same escalation the delete policy was written to close,
-- reached by demotion instead of removal.
--
-- Now USING (the row as it is) carries the same owner clause as WITH CHECK
-- (the row as it will be): only an owner may touch an owner's membership.
-- The last-owner trigger (cortex_guard_last_owner) is unchanged.
-- ============================================================

do $$
begin
  if to_regclass('public.memberships') is null then
    raise notice 'skipping — table memberships does not exist';
    return;
  end if;

  drop policy if exists "admins update members" on memberships;
  create policy "admins update members" on memberships for update
    using (
      user_org_rank(org_id) >= 4
      and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5)
    )
    with check (
      user_org_rank(org_id) >= 4
      and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5)
    );
end $$;

-- Verify: "admins update members" should show the owner clause in BOTH qual and with_check.
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'memberships'
 order by cmd, policyname;
