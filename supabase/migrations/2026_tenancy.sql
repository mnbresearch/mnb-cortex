-- ============================================================
-- MNB CORTEX — tenancy hardening
-- Safe to run more than once (idempotent).
--
-- Three holes in the original RLS, all exploitable with nothing more than the
-- public anon key and a workspace UUID:
--
--   1. "insert own membership" let ANY authenticated user add themselves to ANY
--      organization. Learn or guess an org id and you are inside another
--      company's workspace, reading their orders, invoices and payroll.
--   2. Every tenant table was granted `for all` to any member, with no role
--      predicate — so a `viewer` could DELETE the workspace's data directly
--      against PostgREST, bypassing requireRole() in the app entirely.
--   3. "authed can create org" let anyone mint unlimited organizations. Each
--      new org defaults to trialing with a credit grant, which is a free-credit
--      farm.
-- ============================================================


-- ------------------------------------------------------------
-- Helper: the caller's role in a given org, as a rank.
-- viewer 1 · analyst 2 · manager 3 · admin 4 · owner 5
-- Mirrors the RANK ladder in src/lib/data.ts and src/lib/actions.ts.
-- ------------------------------------------------------------
create or replace function public.user_org_rank(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(case m.role::text
           when 'owner'   then 5
           when 'admin'   then 4
           when 'manager' then 3
           when 'analyst' then 2
           when 'viewer'  then 1
           else 0 end), 0)
    from memberships m
   where m.user_id = auth.uid() and m.org_id = p_org;
$$;

-- Every INSERT/UPDATE/DELETE policy below calls this function through the
-- anon+cookie client, so `authenticated` MUST keep EXECUTE or every write in
-- the app fails with "permission denied for function user_org_rank".
-- It only ever discloses the caller's own rank, so this is not a disclosure risk.
revoke execute on function public.user_org_rank(uuid) from public, anon;
grant  execute on function public.user_org_rank(uuid) to authenticated;


-- ------------------------------------------------------------
-- 1. Memberships — you may no longer add yourself to an arbitrary org.
--
-- Membership is created by the server (service role) in ensureWorkspace():
-- either bootstrapping your own new workspace, or claiming an invite that was
-- actually addressed to your email. The service role bypasses RLS, so removing
-- the client-side INSERT policy costs the app nothing.
-- ------------------------------------------------------------
drop policy if exists "insert own membership" on memberships;

-- Owners and admins may still manage their own workspace's members from the UI.
drop policy if exists "admins manage members" on memberships;
create policy "admins manage members" on memberships for all
  using (user_org_rank(org_id) >= 4)
  with check (user_org_rank(org_id) >= 4);


-- ------------------------------------------------------------
-- 2. Tenant tables — split read / write / delete by role.
--
-- Replaces the single `for all` policy created by the loop in rls.sql, which
-- gave every member (including `viewer`) full delete rights at the database
-- layer regardless of what requireRole() did in the app.
--
--   SELECT          any member          — a viewer can see everything
--   INSERT / UPDATE analyst and above   — matches requireOrg() in actions.ts
--   DELETE          manager and above   — matches requireRole("manager")
--
-- Deliberately mirrors the app's own ladder so a permitted action never fails
-- with an opaque RLS error, and a forbidden one fails even if a future code
-- path forgets to check.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'health_metrics','ai_insights','alerts','sales_orders','sales_pipeline',
    'finance_ledger','invoices','production_runs','inventory_items','purchase_orders',
    'employees','market_reports','strategy_docs','documents','meetings','workflows','workflow_runs',
    'customers','activity','invites','report_links','api_keys','integrations',
    'memories','memory_entities','memory_links','memory_profile',
    'agent_specs','agent_runs','email_templates','email_campaigns','campaign_recipients',
    'email_replies','subscriptions'
  ]) loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('alter table %I enable row level security;', t);

    -- Drop the permissive policies created by earlier migrations.
    execute format('drop policy if exists "tenant all %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant read %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant insert %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant update %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant delete %1$s" on %1$I;', t);

    execute format($f$create policy "tenant read %1$s" on %1$I for select
      using (org_id in (select user_org_ids()));$f$, t);

    execute format($f$create policy "tenant insert %1$s" on %1$I for insert
      with check (user_org_rank(org_id) >= 2);$f$, t);

    execute format($f$create policy "tenant update %1$s" on %1$I for update
      using (user_org_rank(org_id) >= 2)
      with check (user_org_rank(org_id) >= 2);$f$, t);

    execute format($f$create policy "tenant delete %1$s" on %1$I for delete
      using (user_org_rank(org_id) >= 3);$f$, t);
  end loop;
end $$;


-- chat_threads deliberately stays open to every member: starting a conversation
-- with your own AI COO is not a privileged write, and gating it at analyst would
-- lock a viewer out of the product's main feature.
do $$
begin
  if to_regclass('public.chat_threads') is not null then
    execute 'alter table chat_threads enable row level security';
    execute 'drop policy if exists "tenant all chat_threads" on chat_threads';
    execute 'drop policy if exists "tenant chat_threads" on chat_threads';
    execute $p$create policy "tenant chat_threads" on chat_threads for all
      using (org_id in (select user_org_ids()))
      with check (org_id in (select user_org_ids()));$p$;
  end if;
end $$;


-- chat_messages is scoped through its parent thread rather than an org_id, so
-- it needs its own split. Its old "tenant chat msgs" policy was `for all`,
-- which let a viewer delete the workspace's entire chat history.
do $$
begin
  if to_regclass('public.chat_messages') is not null then
    execute 'drop policy if exists "tenant chat msgs" on chat_messages';
    execute 'drop policy if exists "chat msgs read" on chat_messages';
    execute 'drop policy if exists "chat msgs write" on chat_messages';
    execute $p$create policy "chat msgs read" on chat_messages for select
      using (thread_id in (select id from chat_threads where org_id in (select user_org_ids())));$p$;
    execute $p$create policy "chat msgs write" on chat_messages for all
      using (thread_id in (select id from chat_threads where user_org_rank(org_id) >= 2))
      with check (thread_id in (select id from chat_threads where user_org_rank(org_id) >= 2));$p$;
  end if;
end $$;


-- ------------------------------------------------------------
-- 3. Organizations — no more unlimited self-serve org creation.
--
-- ensureWorkspace() creates workspaces with the service role, so the client
-- never needs INSERT. Updates stay limited to admins of that workspace.
-- ------------------------------------------------------------
drop policy if exists "authed can create org" on organizations;

drop policy if exists "member update org" on organizations;
create policy "member update org" on organizations for update
  using (user_org_rank(id) >= 4)
  with check (user_org_rank(id) >= 4);


-- ------------------------------------------------------------
-- 4. Invites — a recipient must be able to see an invite addressed to them.
--
-- The old policy scoped invites to existing members only, which meant the one
-- person who needed to read it could not. Acceptance runs server-side with the
-- service role, but this keeps the data model honest.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.invites') is not null then
    execute 'drop policy if exists "invitee can read own invite" on invites';
    execute $p$create policy "invitee can read own invite" on invites for select
      using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));$p$;
  end if;
end $$;
