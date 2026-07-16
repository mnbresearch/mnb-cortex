-- ============================================================
-- MNB CORTEX — Row Level Security
-- Every tenant table is scoped to the user's organization(s).
-- Run AFTER schema.sql.
-- ============================================================

-- helper: orgs the current user belongs to
create or replace function public.user_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from memberships where user_id = auth.uid();
$$;

-- profiles
alter table profiles enable row level security;
create policy "own profile read"  on profiles for select using (id = auth.uid());
create policy "own profile write" on profiles for all    using (id = auth.uid()) with check (id = auth.uid());

-- organizations
alter table organizations enable row level security;
create policy "member can read org" on organizations for select using (id in (select user_org_ids()));
create policy "authed can create org" on organizations for insert with check (auth.uid() is not null);

-- memberships
alter table memberships enable row level security;
create policy "read own memberships" on memberships for select using (user_id = auth.uid() or org_id in (select user_org_ids()));
create policy "insert own membership" on memberships for insert with check (user_id = auth.uid());

-- generic tenant tables: SELECT/INSERT/UPDATE/DELETE scoped to org membership
do $$
declare t text;
begin
  for t in select unnest(array[
    'health_metrics','ai_insights','alerts','chat_threads','sales_orders','sales_pipeline',
    'finance_ledger','invoices','production_runs','inventory_items','purchase_orders',
    'employees','market_reports','strategy_docs','documents','meetings','workflows','workflow_runs'
  ]) loop
    execute format('alter table %I enable row level security;', t);
    execute format($f$create policy "tenant all %1$s" on %1$I for all
      using (org_id in (select user_org_ids()))
      with check (org_id in (select user_org_ids()));$f$, t);
  end loop;
end $$;

-- chat_messages scoped via parent thread
alter table chat_messages enable row level security;
create policy "tenant chat msgs" on chat_messages for all
  using (thread_id in (select id from chat_threads where org_id in (select user_org_ids())))
  with check (thread_id in (select id from chat_threads where org_id in (select user_org_ids())));

-- auto-create profile + demo org on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.organizations (name, industry, annual_revenue_cr)
    values ('My Company', 'manufacturing', 25) returning id into new_org;
  insert into public.memberships (org_id, user_id, role) values (new_org, new.id, 'owner');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
