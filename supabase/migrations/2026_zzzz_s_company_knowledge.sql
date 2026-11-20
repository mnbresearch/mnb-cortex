/*
  2026_zzzz_s_company_knowledge.sql — Company Knowledge: the company's own
  mail, chats, documents and connected systems, searchable by its agents.

  Run once in the Supabase SQL editor (also shipped as
  supabase/RUN-2026-11-20-company-knowledge.sql, the same text). Idempotent and
  additive: no existing table or column is changed.

  THE SHAPE
    knowledge_sources  one row per connected source: Microsoft 365 (Outlook,
                       Teams, OneDrive/SharePoint), Google Workspace (Gmail,
                       Drive), a remote MCP server, or uploaded documents.
                       OAuth refresh tokens and MCP bearer tokens are stored
                       AES-256-GCM encrypted (lib/crypto.ts) in `secret` —
                       never returned to the browser.
    knowledge_items    one row per email, chat message, document chunk or
                       report. Every row carries where it came from (provider,
                       title, author, date, link) so every answer an agent
                       gives from it can name its source.

  SEARCH
    A generated tsvector over title + author + content, GIN-indexed, so a
    search is one indexed query per workspace. `simple` config, not `english`:
    names, invoice numbers and Hinglish do not survive English stemming.

  WHO MAY WRITE
    Members READ their own workspace's rows (RLS on user_org_ids()). Nobody
    writes through PostgREST: connecting, syncing, uploading and deleting go
    through the server with the service role after role and plan checks —
    the same model as the agent tables.
*/

create table if not exists knowledge_sources (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  created_by     uuid,
  provider       text not null check (provider in ('microsoft365', 'google_workspace', 'mcp', 'upload')),
  label          text not null,
  status         text not null default 'active' check (status in ('active', 'paused', 'error', 'needs_reauth')),
  status_reason  text,
  account        text,                                -- the mailbox or account it reads, shown to the owner
  scopes         text[] not null default '{}',        -- what it may read: mail, chats, files, tools
  config         jsonb not null default '{}'::jsonb,  -- non-secret settings: MCP url, allowed tools, sync window
  secret         text,                                -- encrypted refresh / bearer token; never selected for the browser
  item_count     int not null default 0,
  last_synced_at timestamptz,
  next_sync_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_knowledge_sources_org on knowledge_sources(org_id, created_at desc);
create index if not exists idx_knowledge_sources_due on knowledge_sources(status, next_sync_at);

create table if not exists knowledge_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  source_id    uuid not null references knowledge_sources(id) on delete cascade,
  provider     text not null,
  kind         text not null check (kind in ('email', 'chat', 'document', 'file', 'report', 'record')),
  external_id  text not null,
  title        text,
  author       text,
  occurred_at  timestamptz,
  url          text,
  content      text not null default '',
  metadata     jsonb not null default '{}'::jsonb,
  search       tsvector generated always as (
                 setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                 setweight(to_tsvector('simple', coalesce(author, '')), 'B') ||
                 setweight(to_tsvector('simple', coalesce(content, '')), 'C')
               ) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source_id, external_id)
);

create index if not exists idx_knowledge_items_org_time on knowledge_items(org_id, occurred_at desc);
create index if not exists idx_knowledge_items_search on knowledge_items using gin(search);

alter table knowledge_sources enable row level security;
alter table knowledge_items   enable row level security;

drop policy if exists "members read knowledge_sources" on knowledge_sources;
create policy "members read knowledge_sources" on knowledge_sources for select
  using (org_id in (select user_org_ids()));

drop policy if exists "members read knowledge_items" on knowledge_items;
create policy "members read knowledge_items" on knowledge_items for select
  using (org_id in (select user_org_ids()));

/* The encrypted token column is not readable by signed-in users at all, even for their own workspace. */
revoke select on knowledge_sources from anon, authenticated;
grant select (id, org_id, created_by, provider, label, status, status_reason, account, scopes, config, item_count, last_synced_at, next_sync_at, created_at, updated_at)
  on knowledge_sources to authenticated;

/* Writes are server-only (service role), after the role and plan checks in lib/knowledge/. */
revoke insert, update, delete on knowledge_sources from anon, authenticated;
revoke insert, update, delete on knowledge_items   from anon, authenticated;
