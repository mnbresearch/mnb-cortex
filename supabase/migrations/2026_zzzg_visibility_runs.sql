/*
  AI Visibility runs, kept.

  WHAT WAS WRONG: nothing was stored. An AI Visibility check is the single most
  expensive action in the product — 89 credits, more than three times the next
  one — and the result existed only in the browser tab that requested it. Close
  the tab and the 89 credits bought a number the customer could no longer see.

  Worse for the thing it is sold as. "Do AI engines recommend you?" is not a
  one-off fact; it is a position that moves as the web moves and as the
  customer's own listings change. Without history, running it a second time
  told you nothing you could compare, so the honest sales pitch was "buy a
  snapshot", while the module is presented as monitoring. Storing each run is
  what makes "you were named in 3 of 8 answers, now 5 of 8" possible, and that
  sentence is the entire reason to run it again.

  The full report is kept as jsonb rather than shredded into tables. The scored
  columns beside it are the ones that get compared, charted and alerted on, so
  they are real columns and indexed; the per-prompt answers, citations and
  competitor lists are for reading back one run and have no query patterns of
  their own. Splitting them into five child tables would buy nothing and add
  five more places for an org_id to go missing.
*/

create table if not exists visibility_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,

  /* What was asked. Stored so a later run can be compared like for like — a
     score against a different brand, category or city is not a trend. */
  brand         text not null,
  category      text,
  location      text,

  /* Which engines actually answered, and whether any had live web access. */
  engine        text,
  grounded      boolean not null default false,

  /*
    presence   share of answers naming the brand, 0-100
    prominence position-weighted, 0-100 — see lib/ai/visibility-match.ts
    avg_position mean list rank where ranked; NULL when never ranked, which is
               DISTINCT from rank 0 and must not be coalesced to it
    share_of_voice NULL when no brand at all was named, again not 0
  */
  presence      int not null,
  prominence    int not null,
  avg_position  numeric(4,1),
  share_of_voice int,

  prompts_count int not null default 0,
  mentions_count int not null default 0,

  /* The whole report, for reading one run back in full. */
  report        jsonb not null,

  created_at    timestamptz not null default now()
);

/* The only query this table has: this workspace's runs, newest first. */
create index if not exists visibility_runs_org_time_idx
  on visibility_runs (org_id, created_at desc);

alter table visibility_runs enable row level security;

drop policy if exists "members read visibility_runs" on visibility_runs;
create policy "members read visibility_runs" on visibility_runs for select
  using (org_id in (select user_org_ids()));
drop policy if exists "members write visibility_runs" on visibility_runs;
create policy "members write visibility_runs" on visibility_runs for insert
  with check (org_id in (select user_org_ids()));
drop policy if exists "members update visibility_runs" on visibility_runs;
create policy "members update visibility_runs" on visibility_runs for update
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));
drop policy if exists "members delete visibility_runs" on visibility_runs;
create policy "members delete visibility_runs" on visibility_runs for delete
  using (org_id in (select user_org_ids()));
