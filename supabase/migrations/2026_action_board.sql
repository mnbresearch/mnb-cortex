/*
  The owner's task board and decision journal, moved out of localStorage.

  WHY THIS MATTERS MORE THAN IT LOOKS.

  `components/action-board.tsx` and `components/decision-journal.tsx` kept
  everything in `localStorage`. Three consequences, and the first is fatal for
  this market:

    1. The owner opens Cortex on his PHONE and the board is empty. Not stale —
       empty, as if he had never written anything. For a product whose users
       run their businesses from a phone, that is the whole feature gone.
    2. Nobody else in the workspace can see what was committed to. A "COO" whose
       action list is invisible to the team is a notepad.
    3. Cortex can never ask "you said you'd chase Sharma Traders three weeks ago
       — did you?", which is exactly the loop the product is sold on. Closing
       that loop requires the tasks to exist somewhere the server can read.

  `components/alert-rules.tsx` already carries a comment describing this exact
  bug being fixed for alert rules — "synced it to localStorage, which is
  precisely why they were invisible on a second device". The lesson had not been
  applied to the two surfaces where it costs the most.

  Same shape as `goals`: org-scoped, RLS by membership, no service role needed.
*/

create table if not exists action_tasks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  title      text not null,
  /* 0 = to do, 1 = in progress, 2 = done — matches the board's columns. */
  col        smallint not null default 0 check (col between 0 and 2),
  priority   text check (priority in ('P1','P2','P3')),
  /*
    Who added it, and whether Cortex suggested it. `source` is what makes the
    follow-up loop possible later: "of the 8 things I suggested, you did 3."
  */
  source     text not null default 'user' check (source in ('user','ai')),
  created_by uuid,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists action_tasks_org_idx on action_tasks (org_id, col, created_at desc);

create table if not exists decisions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  title      text not null,
  rationale  text,
  expected   text,
  review_at  date,
  outcome    text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists decisions_org_idx on decisions (org_id, created_at desc);

alter table action_tasks enable row level security;
alter table decisions    enable row level security;

/*
  Membership-scoped, all four verbs. Unlike referrals or credits, these ARE the
  user's own content and they must be able to write them directly — there is no
  value being granted here, so no reason to route through the service role.
*/
do $$
declare t text;
begin
  foreach t in array array['action_tasks','decisions'] loop
    execute format('drop policy if exists "members read %1$s" on %1$s', t);
    execute format('create policy "members read %1$s" on %1$s for select using (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members write %1$s" on %1$s', t);
    execute format('create policy "members write %1$s" on %1$s for insert with check (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members update %1$s" on %1$s', t);
    execute format('create policy "members update %1$s" on %1$s for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members delete %1$s" on %1$s', t);
    execute format('create policy "members delete %1$s" on %1$s for delete using (org_id in (select user_org_ids()))', t);
  end loop;
end $$;
