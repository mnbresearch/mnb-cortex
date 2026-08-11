-- MNB Cortex — SECURITY FIX: scope the `leads` table per workspace.
-- Previously RLS was `using (true)`, so any signed-in customer could read/delete
-- every tenant's pricing-inquiry PII. This adds org_id and locks reads/deletes to
-- the caller's own workspace. Public inquiries insert with org_id = null (platform
-- leads) and are only readable by the service role (the platform owner's console).
-- Run once in the Supabase SQL editor. Idempotent.

alter table leads add column if not exists org_id uuid references organizations(id) on delete set null;
create index if not exists idx_leads_org on leads(org_id, created_at desc);

-- Reads: only your own workspace's leads.
drop policy if exists "auth read leads" on leads;
create policy "auth read leads" on leads for select to authenticated
  using (org_id in (select user_org_ids()));

-- Deletes: only your own workspace's leads.
drop policy if exists "auth delete leads" on leads;
create policy "auth delete leads" on leads for delete to authenticated
  using (org_id in (select user_org_ids()));

-- Inserts stay open (the public pricing form posts as anon/auth with org_id null).
drop policy if exists "anon insert leads" on leads;
create policy "anon insert leads" on leads for insert to anon with check (true);
drop policy if exists "auth insert leads" on leads;
create policy "auth insert leads" on leads for insert to authenticated with check (true);
