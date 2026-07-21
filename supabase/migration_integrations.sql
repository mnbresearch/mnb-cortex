-- MNB Cortex — secure integrations (run once in the Supabase SQL editor)

-- 1. Store encrypted third-party credentials alongside the existing config.
alter table integrations add column if not exists credentials_encrypted text;
alter table integrations add column if not exists created_by uuid references auth.users(id);
alter table integrations add column if not exists updated_at timestamptz default now();

-- 2. Keep row-level security tenant-scoped (idempotent).
alter table integrations enable row level security;
drop policy if exists "tenant integrations" on integrations;
create policy "tenant integrations" on integrations for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from memberships where user_id = auth.uid()));

-- 3. Only admins/owners may write integration rows (reads stay workspace-wide).
drop policy if exists "admin manage integrations" on integrations;
create policy "admin manage integrations" on integrations for all
  using (
    org_id in (
      select org_id from memberships
      where user_id = auth.uid() and role in ('admin','owner')
    )
  )
  with check (
    org_id in (
      select org_id from memberships
      where user_id = auth.uid() and role in ('admin','owner')
    )
  );

-- 4. Touch updated_at on change.
create or replace function touch_integrations() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists integrations_touch on integrations;
create trigger integrations_touch before update on integrations
  for each row execute function touch_integrations();
