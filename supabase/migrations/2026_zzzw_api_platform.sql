/*
  API PLATFORM v2 — scoped, expiring, rotatable, revocable keys; an audit
  trail without secrets; per-key usage counts.

  ADDITIVE AND SAFE TO RE-RUN. No row is deleted, no column dropped. Deploy
  the code FIRST, then run this: the code works on a database without these
  columns (it falls back to v1 behaviour), but the v1 code cannot create keys
  once step 4 revokes the browser's write access.

  ============================================================================
  1. api_keys: the lifecycle columns
  ============================================================================

  Keys issued before this get exactly the two powers they already had —
  metrics:read and ingest:write — and no expiry (expiring a running
  integration nobody chose to expire would be an outage we caused). The new
  read endpoints need a key that asks for them.
*/
alter table api_keys add column if not exists scopes       text[];
alter table api_keys add column if not exists expires_at   timestamptz;
alter table api_keys add column if not exists revoked_at   timestamptz;
alter table api_keys add column if not exists revoked_by   uuid;
alter table api_keys add column if not exists created_by   uuid;
alter table api_keys add column if not exists last_used_at timestamptz;
alter table api_keys add column if not exists rotated_from uuid references api_keys(id) on delete set null;

update api_keys set scopes = array['metrics:read', 'ingest:write'] where scopes is null;
alter table api_keys alter column scopes set default array['metrics:read', 'ingest:write'];
alter table api_keys alter column scopes set not null;

create index if not exists api_keys_org_active on api_keys (org_id, created_at desc) where revoked_at is null;

/*
  ============================================================================
  2. api_key_events — who created, rotated, revoked which key, and when
  ============================================================================
  Never the secret, never the hash: the PREFIX (mnbc_<id>) identifies the key.
  Written only by the service role, after the server action has checked the
  caller's role and second factor. Admins read their own workspace's trail.
*/
create table if not exists api_key_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  key_id      uuid references api_keys(id) on delete set null,
  key_prefix  text,
  event       text not null check (event in ('created', 'rotated', 'regenerated', 'revoked')),
  actor       uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists api_key_events_org on api_key_events (org_id, created_at desc);
alter table api_key_events enable row level security;
drop policy if exists "admins read api key events" on api_key_events;
create policy "admins read api key events" on api_key_events for select using (user_org_rank(org_id) >= 4);
revoke insert, update, delete on api_key_events from anon, authenticated;
grant select, insert on api_key_events to service_role;

/*
  ============================================================================
  3. api_usage_daily — calls per key, per endpoint, per day
  ============================================================================
  `denied` counts revoked / expired / out-of-scope / rate-limited calls, so an
  owner can see an integration failing before its author notices. One row per
  (key, endpoint, day), incremented in place — not a row per call.
*/
create table if not exists api_usage_daily (
  org_id    uuid not null references organizations(id) on delete cascade,
  key_id    uuid not null references api_keys(id) on delete cascade,
  day       date not null,
  endpoint  text not null,
  calls     integer not null default 0,
  denied    integer not null default 0,
  primary key (key_id, endpoint, day)
);
create index if not exists api_usage_daily_org on api_usage_daily (org_id, day desc);
alter table api_usage_daily enable row level security;
drop policy if exists "admins read api usage" on api_usage_daily;
create policy "admins read api usage" on api_usage_daily for select using (user_org_rank(org_id) >= 4);
revoke insert, update, delete on api_usage_daily from anon, authenticated;
grant select, insert, update on api_usage_daily to service_role;

create or replace function public.api_usage_bump(p_org uuid, p_key uuid, p_endpoint text, p_ok boolean)
returns void language sql security definer set search_path = public as $$
  insert into api_usage_daily (org_id, key_id, day, endpoint, calls, denied)
  values (p_org, p_key, (now() at time zone 'Asia/Kolkata')::date, left(p_endpoint, 60),
          case when p_ok then 1 else 0 end, case when p_ok then 0 else 1 end)
  on conflict (key_id, endpoint, day) do update set
    calls  = api_usage_daily.calls  + excluded.calls,
    denied = api_usage_daily.denied + excluded.denied;
$$;
revoke all on function public.api_usage_bump(uuid, uuid, text, boolean) from public;
revoke all on function public.api_usage_bump(uuid, uuid, text, boolean) from anon, authenticated;
grant execute on function public.api_usage_bump(uuid, uuid, text, boolean) to service_role;

/*
  ============================================================================
  4. Only the server writes api_keys
  ============================================================================
  THE HOLE. RLS let an admin INSERT and UPDATE api_keys straight through
  PostgREST with the browser's own session. The app's "Generate key" checks
  the plan and asks for a second factor; a direct
      POST /rest/v1/api_keys  { org_id, key_hash: sha256(<my string>) }
  skipped both — a Watch workspace could mint a working key with no MFA, and
  an admin could un-revoke a revoked key by PATCHing revoked_at back to null.

  Now every write goes through a server action (role + plan + second factor)
  using the service role. Admins keep SELECT, which is what /developers needs.
*/
revoke insert, update, delete on api_keys from anon, authenticated;
grant select, insert, update, delete on api_keys to service_role;

/*
  ============================================================================
  5. The two SQL entry points refuse revoked, expired and out-of-scope keys
  ============================================================================
  The route checks this first (lib/api/auth.ts). Doing it here too means a
  future caller that forgets cannot reopen it. Bodies otherwise identical to
  2026_zzzv.
*/
create or replace function public.api_ingest(p_key text, p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_count int := 0;
  v_total int := coalesce(jsonb_array_length(p_rows), 0);
  v_skipped int := 0;
begin
  select org_id into v_org from api_keys
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and 'ingest:write' = any(scopes);
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'rows must be an array');
  end if;
  if v_total > 10000 then
    return jsonb_build_object('ok', false, 'error', 'at most 10000 rows per call');
  end if;

  if p_table = 'sales_orders' then
    select count(*) into v_skipped from jsonb_array_elements(p_rows) r where nullif(trim(r->>'order_no'), '') is null;
    insert into sales_orders (org_id, order_no, customer_name, region, product, amount, status, order_date)
      select distinct on (trim(r->>'order_no'))
             v_org, trim(r->>'order_no'), r->>'customer_name', nullif(r->>'region', ''),
             r->>'product', coalesce((r->>'amount')::numeric, 0), lower(trim(coalesce(nullif(r->>'status', ''), 'won'))),
             coalesce((r->>'order_date')::date, current_date)
        from jsonb_array_elements(p_rows) r
       where nullif(trim(r->>'order_no'), '') is not null
      on conflict (org_id, order_no) do update set
        customer_name = excluded.customer_name, region = coalesce(excluded.region, sales_orders.region),
        product = excluded.product, amount = excluded.amount, status = excluded.status, order_date = excluded.order_date;
  elsif p_table = 'invoices' then
    select count(*) into v_skipped from jsonb_array_elements(p_rows) r where nullif(trim(r->>'invoice_no'), '') is null;
    insert into invoices (org_id, invoice_no, party, amount, status, type, issue_date, due_date)
      select distinct on (trim(r->>'invoice_no'))
             v_org, trim(r->>'invoice_no'), r->>'party',
             coalesce((r->>'amount')::numeric, 0), lower(trim(coalesce(nullif(r->>'status', ''), 'pending'))),
             case when lower(trim(coalesce(r->>'type', ''))) = 'payable' then 'payable' else 'receivable' end,
             coalesce((r->>'issue_date')::date, ((r->>'due_date')::date - interval '30 days')::date),
             coalesce((r->>'due_date')::date, coalesce((r->>'issue_date')::date, current_date) + 15)
        from jsonb_array_elements(p_rows) r
       where nullif(trim(r->>'invoice_no'), '') is not null
      on conflict (org_id, invoice_no) do update set
        party = excluded.party, amount = excluded.amount, status = excluded.status, type = excluded.type,
        issue_date = excluded.issue_date, due_date = excluded.due_date;
  elsif p_table = 'inventory_items' then
    insert into inventory_items (org_id, sku, name, category, on_hand, reorder_level, unit_cost, supplier)
      select v_org, r->>'sku', r->>'name', coalesce(r->>'category', 'raw'), coalesce((r->>'on_hand')::numeric, 0),
             coalesce((r->>'reorder_level')::numeric, 0), coalesce((r->>'unit_cost')::numeric, 0), r->>'supplier'
        from jsonb_array_elements(p_rows) r;
  elsif p_table = 'customers' then
    select count(*) into v_skipped from jsonb_array_elements(p_rows) r where nullif(trim(r->>'name'), '') is null;
    insert into customers (org_id, name, company, email, phone, status, value)
      select distinct on (trim(r->>'name'))
             v_org, trim(r->>'name'), r->>'company', r->>'email', r->>'phone',
             coalesce(nullif(r->>'status', ''), 'lead'), coalesce((r->>'value')::numeric, 0)
        from jsonb_array_elements(p_rows) r
       where nullif(trim(r->>'name'), '') is not null
      on conflict (org_id, name) do update set
        company = coalesce(excluded.company, customers.company), email = coalesce(excluded.email, customers.email),
        phone = coalesce(excluded.phone, customers.phone), status = excluded.status, value = excluded.value;
  elsif p_table = 'leads' then
    select count(*) into v_skipped from jsonb_array_elements(p_rows) r
     where nullif(trim(r->>'email'), '') is null and nullif(right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10), '') is null;
    insert into leads (org_id, name, email, phone, company, plan, note, source)
      select distinct on (coalesce(lower(nullif(trim(r->>'email'), '')), right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10)))
             v_org, nullif(trim(r->>'name'), ''), lower(nullif(trim(r->>'email'), '')), nullif(trim(r->>'phone'), ''),
             nullif(trim(r->>'company'), ''), nullif(trim(r->>'plan'), ''), left(nullif(trim(r->>'note'), ''), 2000),
             coalesce(nullif(trim(r->>'source'), ''), 'api')
        from jsonb_array_elements(p_rows) r
       where (nullif(trim(r->>'email'), '') is not null or nullif(right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10), '') is not null)
         and not exists (
           select 1 from leads l where l.org_id = v_org and (
             (nullif(trim(r->>'email'), '') is not null and lower(l.email) = lower(trim(r->>'email')))
             or (nullif(right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10), '') is not null
                 and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10))));
  else
    return jsonb_build_object('ok', false, 'error', 'table not allowed');
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'written', v_count, 'inserted', v_count,
    'skipped_no_key', v_skipped,
    'note', case when v_skipped > 0 then v_skipped || ' row(s) had no ' ||
      case p_table when 'sales_orders' then 'order_no' when 'invoices' then 'invoice_no' when 'leads' then 'email or phone' else 'name' end ||
      ' and were not written' else null end);
end $$;

create or replace function public.api_metrics(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v jsonb;
begin
  select org_id into v_org from api_keys
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and 'metrics:read' = any(scopes);
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;
  select jsonb_agg(jsonb_build_object('metric', metric_key, 'label', label, 'value', value, 'unit', unit, 'delta_pct', delta_pct, 'status', status))
    into v from health_metrics where org_id = v_org;
  return jsonb_build_object('ok', true, 'metrics', coalesce(v, '[]'::jsonb));
end $$;

revoke all on function public.api_ingest(text, text, jsonb) from public;
revoke all on function public.api_ingest(text, text, jsonb) from anon, authenticated;
grant execute on function public.api_ingest(text, text, jsonb) to service_role;
revoke all on function public.api_metrics(text) from public;
revoke all on function public.api_metrics(text) from anon, authenticated;
grant execute on function public.api_metrics(text) to service_role;

notify pgrst, 'reload schema';

/* ---------- verify ---------- expect every row true */
select 'api_keys.scopes' as item, exists (select 1 from information_schema.columns where table_name = 'api_keys' and column_name = 'scopes') as ok
union all
select 'every key has scopes', not exists (select 1 from api_keys where scopes is null)
union all
select 'api_keys.expires_at/revoked_at/last_used_at', (select count(*) = 3 from information_schema.columns where table_name = 'api_keys' and column_name in ('expires_at', 'revoked_at', 'last_used_at'))
union all
select 'api_key_events table', to_regclass('public.api_key_events') is not null
union all
select 'api_usage_daily table', to_regclass('public.api_usage_daily') is not null
union all
select 'browser cannot insert api_keys', not has_table_privilege('authenticated', 'public.api_keys', 'INSERT')
union all
select 'browser cannot update api_keys', not has_table_privilege('authenticated', 'public.api_keys', 'UPDATE')
union all
select 'api_ingest checks revocation', position('revoked_at is null' in pg_get_functiondef('public.api_ingest(text,text,jsonb)'::regprocedure)) > 0
union all
select 'api_metrics checks scope', position('metrics:read' in pg_get_functiondef('public.api_metrics(text)'::regprocedure)) > 0
union all
select 'api_usage_bump service-only', not has_function_privilege('authenticated', 'public.api_usage_bump(uuid,uuid,text,boolean)', 'EXECUTE');
