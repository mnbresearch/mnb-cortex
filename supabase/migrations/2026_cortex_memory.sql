-- v4.0.0 — Cortex Memory: the AI COO's long-term memory. Safe to run repeatedly.

-- 1) MEMORIES — atomic, evolving business facts / notes.
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  author uuid,                              -- user who created it (null = system)
  kind text not null default 'fact',        -- fact | preference | decision | insight | instruction | event
  title text,
  content text not null,
  entities text[] default '{}',             -- linked entity names
  tags text[] default '{}',
  source text default 'manual',             -- manual | chat | document | import | extract | connector
  source_ref text,                          -- id/url of the source
  importance int not null default 3,        -- 1..5
  confidence numeric not null default 0.9,  -- 0..1
  status text not null default 'active',    -- active | superseded | archived
  supersedes uuid,                          -- memory this one replaces
  pinned boolean not null default false,
  ref_count int not null default 0,         -- times recalled into AI context
  valid_from timestamptz default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Full-text search vector (kept in sync by trigger — generated columns can't use array cols portably).
alter table memories add column if not exists search tsvector;
create or replace function memories_search_update() returns trigger language plpgsql as $$
begin
  new.search :=
    setweight(to_tsvector('english', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.content,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.tags,' '),'')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.entities,' '),'')), 'C');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists memories_search_trg on memories;
create trigger memories_search_trg before insert or update on memories
  for each row execute function memories_search_update();

create index if not exists memories_org_idx on memories(org_id, status, created_at desc);
create index if not exists memories_search_idx on memories using gin(search);
create index if not exists memories_entities_idx on memories using gin(entities);
create index if not exists memories_tags_idx on memories using gin(tags);

-- 2) ENTITIES — knowledge-graph nodes (people, customers, vendors, products, …).
create table if not exists memory_entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  type text not null default 'concept',     -- person | customer | vendor | product | competitor | project | concept
  summary text,
  attributes jsonb default '{}'::jsonb,
  mention_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, lower(name))
);
create index if not exists memory_entities_org_idx on memory_entities(org_id, type);

-- 3) LINKS — knowledge-graph edges between entities.
create table if not exists memory_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  from_name text not null,
  to_name text not null,
  relation text not null default 'related',
  created_at timestamptz not null default now(),
  unique (org_id, lower(from_name), lower(to_name), relation)
);
create index if not exists memory_links_org_idx on memory_links(org_id);

-- 4) PROFILE — one synthesized living "company brain" summary per workspace.
create table if not exists memory_profile (
  org_id uuid primary key references organizations(id) on delete cascade,
  profile_md text,
  highlights jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-level security: members read their workspace's memory; writes go through the service role.
alter table memories enable row level security;
alter table memory_entities enable row level security;
alter table memory_links enable row level security;
alter table memory_profile enable row level security;

do $$ begin
  create policy mem_sel on memories for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ent_sel on memory_entities for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy lnk_sel on memory_links for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy prof_sel on memory_profile for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
exception when duplicate_object then null; end $$;

-- Bump a memory's recall counter (used when it's injected into AI context).
create or replace function bump_memory_refs(p_ids uuid[])
returns void language sql as $$
  update memories set ref_count = ref_count + 1 where id = any(p_ids);
$$;
