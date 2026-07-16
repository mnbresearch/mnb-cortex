-- ===== Batch 4: branding, plan, subscriptions, public report links =====
alter table organizations add column if not exists accent text default 'indigo';
alter table organizations add column if not exists plan text default 'growth';

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  plan text, status text default 'active', provider text, amount numeric,
  reference text, created_at timestamptz default now()
);
alter table subscriptions enable row level security;
drop policy if exists "tenant subs" on subscriptions;
create policy "tenant subs" on subscriptions for all
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

create table if not exists report_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  token text unique not null,
  created_at timestamptz default now()
);
alter table report_links enable row level security;
drop policy if exists "tenant report_links" on report_links;
create policy "tenant report_links" on report_links for all
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

-- Public read-only report by share token (no auth)
create or replace function public.public_report(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_metrics jsonb; v_insights jsonb;
begin
  select org_id into v_org from report_links where token = p_token;
  if v_org is null then return jsonb_build_object('ok', false); end if;
  select name into v_name from organizations where id = v_org;
  select jsonb_agg(jsonb_build_object('label', label, 'value', value, 'unit', unit, 'delta_pct', delta_pct, 'status', status))
    into v_metrics from health_metrics where org_id = v_org;
  select jsonb_agg(jsonb_build_object('title', title, 'detail', detail, 'severity', severity))
    into v_insights from ai_insights where org_id = v_org limit 4;
  return jsonb_build_object('ok', true, 'company', coalesce(v_name,'Company'),
    'metrics', coalesce(v_metrics,'[]'::jsonb), 'insights', coalesce(v_insights,'[]'::jsonb));
end $$;
grant execute on function public.public_report(text) to anon, authenticated;

-- Allow members to update their own organization (needed for settings + plan)
drop policy if exists "member update org" on organizations;
create policy "member update org" on organizations for update
  using (id in (select user_org_ids())) with check (id in (select user_org_ids()));
