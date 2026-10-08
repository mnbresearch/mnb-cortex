/*
  MEDIA LIBRARY, SALES CORRECTNESS, AND THE NIGHTLY WATCH.

  Additive and safe to re-run. The code deployed with this works before it is
  applied (it detects the missing table and behaves as it did yesterday) and
  gains persistence, refunds and the sales fixes once it is.

  ============================================================================
  1. media_assets — every generated image and video, per workspace
  ============================================================================

  Before: a video existed only in the browser tab that asked for it. Close the
  tab, or let the six-minute poll give up, and the clip — which costs about
  ₹77 of Veo time — was gone, and if Veo failed AFTER accepting the job the
  credits were never refunded (only submit-time failures were). Images were
  kept as data URLs in React state; agent_runs recorded the text
  "[image generated]".

  Now: a row per job. Videos are created `running` at submit, settled by the
  status poll or by the nightly sweep (done → file copied into Storage; failed
  → refunded exactly once, guarded by `refunded`). Images are stored as soon
  as they are generated. Members read their own workspace's rows; only the
  service role writes.

  Files live in the private Storage bucket `media`, under <org_id>/<id>.<ext>.
  Nobody reads the bucket directly — /api/media checks membership and hands
  out a short-lived signed URL.
*/

create table if not exists media_assets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid,
  kind         text not null check (kind in ('image', 'video')),
  agent_id     text,
  title        text,
  prompt       text,
  aspect       text,
  status       text not null default 'done' check (status in ('running', 'done', 'failed')),
  operation    text unique,
  result_uri   text,
  storage_path text,
  mime         text,
  cost         integer not null default 0,
  charged      boolean not null default false,
  refunded     boolean not null default false,
  byo          boolean not null default false,
  error        text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists media_assets_org_created on media_assets (org_id, created_at desc);
create index if not exists media_assets_running on media_assets (status, created_at) where status = 'running';

alter table media_assets enable row level security;
drop policy if exists "members read media" on media_assets;
create policy "members read media" on media_assets
  for select using (org_id in (select user_org_ids()));
revoke insert, update, delete on media_assets from anon, authenticated;
grant select, insert, update, delete on media_assets to service_role;

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

/*
  ============================================================================
  2. Sales correctness
  ============================================================================

  a) STATUS CASE. Revenue is `status = 'won'` in SQL, but a Tally or CSV export
     writes "Won", and api_ingest stored it verbatim — so the workspace showed
     ₹0 revenue and empty RFM. The code now lowercases on every write; this
     fixes the rows already stored.
*/
update sales_orders set status = lower(trim(status)) where status is not null and status <> lower(trim(status));
update invoices     set status = lower(trim(status)) where status is not null and status <> lower(trim(status));

/*
  b) DEALS GO STALE FROM THEIR LAST MOVE, NOT THEIR BIRTH. sales_pipeline had
     no updated_at, so "going cold" meant "created 45 days ago" and moving a
     deal changed nothing.
*/
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'sales_pipeline' and column_name = 'updated_at') then
    alter table sales_pipeline add column updated_at timestamptz;
    -- Backfilled once, from the only date we have, BEFORE the trigger exists.
    update sales_pipeline set updated_at = coalesce(created_at, now());
    alter table sales_pipeline alter column updated_at set default now();
  end if;
end $$;
create or replace function cortex_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists sales_pipeline_touch on sales_pipeline;
create trigger sales_pipeline_touch before update on sales_pipeline
  for each row execute function cortex_touch_updated_at();

/*
  c) A LEAD BECOMES A CUSTOMER ONCE. convertLead had no guard, so a second
     click made a duplicate customer.
*/
alter table leads add column if not exists converted_customer_id uuid;

notify pgrst, 'reload schema';

/* ---------- verify ---------- expect every row true */
select 'media_assets table' as item, to_regclass('public.media_assets') is not null as ok
union all
select 'media bucket', exists (select 1 from storage.buckets where id = 'media')
union all
select 'media_assets RLS on', (select relrowsecurity from pg_class where oid = 'public.media_assets'::regclass)
union all
select 'no mixed-case won', not exists (select 1 from sales_orders where status <> lower(trim(status)))
union all
select 'sales_pipeline.updated_at', exists (select 1 from information_schema.columns where table_name = 'sales_pipeline' and column_name = 'updated_at')
union all
select 'leads.converted_customer_id', exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'converted_customer_id');
