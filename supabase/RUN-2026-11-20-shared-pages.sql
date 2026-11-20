/*
  2026_zzzz_w_shared_pages.sql — LIVE SHARE LINKS for agent results and grids.

  A link shows the CURRENT state of what it points at (a grid keeps filling,
  a re-run task shows its new answer), read-only, to anyone holding it — until
  it expires or is revoked. Only the SHA-256 of the token is stored, so a copy
  of this table cannot be turned back into working links. Views are counted.

  Members read their workspace's links; writes and the public lookup go through
  the server (lib/share.ts). Idempotent, additive.
  Also shipped as supabase/RUN-2026-11-20-shared-pages.sql.
*/

create table if not exists shared_pages (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  token_hash     text not null unique,
  kind           text not null check (kind in ('agent_task', 'grid')),
  ref_id         uuid not null,
  title          text not null default '',
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  views          int not null default 0,
  last_viewed_at timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create index if not exists idx_shared_pages_ref on shared_pages(org_id, kind, ref_id);

alter table shared_pages enable row level security;

drop policy if exists "members read shared_pages" on shared_pages;
create policy "members read shared_pages" on shared_pages for select
  using (org_id in (select user_org_ids()));

revoke insert, update, delete on shared_pages from anon, authenticated;
