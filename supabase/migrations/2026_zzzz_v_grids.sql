/*
  2026_zzzz_v_grids.sql — GRIDS: structured analysis across many documents.

  A grid is documents (rows) × questions (columns). Every cell is answered
  from that one document only, with a verbatim quote that Cortex checks is
  really in the document before calling the cell "cited" (lib/grids/core.ts).

  rows    [{ id, item_id, title, url, kind, provider, citation }]
  columns [{ id, question, format }]   format: text | number | yes_no | date
  cells   { "<rowId>:<colId>": { status, answer, quote, verified, error, at } }

  Members read; writes go through the server after the role check
  (lib/grids/store.ts). Idempotent, additive.
  Also shipped as supabase/RUN-2026-11-20-grids.sql.
*/

create table if not exists grids (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  rows        jsonb not null default '[]'::jsonb,
  columns     jsonb not null default '[]'::jsonb,
  cells       jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_grids_org on grids(org_id, updated_at desc);

alter table grids enable row level security;

drop policy if exists "members read grids" on grids;
create policy "members read grids" on grids for select
  using (org_id in (select user_org_ids()));

revoke insert, update, delete on grids from anon, authenticated;
