/*
  The nightly cron serves the same workspaces every night and starves the rest.

  THE BUG, which is silent and permanent.

  api/cron/autopilot orders every workspace by created_at ascending and then:

      const sweepable = (orgs || []).slice(0, SWEEP_CAP);   // SWEEP_CAP = 200
      for (const o of orgs) { ... if (ran >= 20) break; }   // daily analysis

  Both caps exist for good reasons — the function dies at 300s and an LLM call
  is 2-10s. The defect is not the cap, it is that the ordering never moves.
  `slice(0, 200)` of a stably-ordered list is the SAME 200 workspaces every
  single night. Workspace number 201 is never swept, and the twenty-first
  entitled workspace never receives a daily analysis. Not "eventually" — never.

  At 200 workspaces this is invisible. At 10,000 it means 98% of paying
  customers get no daily analysis, no refreshed KPIs and no alerts, while the
  cron returns ok: true and the health check reports "Scheduled jobs:
  operational". A silent, total failure for almost every customer, presented as
  success — and it arrives precisely when the business starts working.

  THE FIX.

  A rotating keyset cursor per job. Each run resumes where the last one stopped
  and wraps at the end, so N runs cover N x CAP workspaces and every workspace
  is reached within a bounded number of nights. Keyset rather than OFFSET
  because (created_at, id) is stable under inserts: a workspace signing up
  mid-rotation is picked up in order instead of shifting the window and causing
  someone else to be skipped.

  Storing (created_at, id) rather than an offset is what makes it correct when
  workspaces are added or deleted between runs.
*/

create table if not exists cron_cursors (
  /* Job name — 'metrics_sweep', 'daily_analysis'. One row per job. */
  name            text primary key,
  /* Keyset position: the last (created_at, id) processed. Null = start. */
  cursor_at       timestamptz,
  cursor_id       uuid,
  /* Operational visibility: how far round the rotation we are. */
  last_run_at     timestamptz,
  processed_total bigint not null default 0,
  wrapped_count   integer not null default 0
);

/*
  No public policy, and RLS on. This is platform state, not tenant data — only
  the service role (the cron itself) has any business reading or writing it.
  Left unlocked it would be one more table PostgREST serves to the anon key.
*/
alter table cron_cursors enable row level security;

insert into cron_cursors (name) values ('metrics_sweep'), ('daily_analysis')
on conflict (name) do nothing;

/*
  Advance a job's cursor, wrapping when a run comes back short.

  SECURITY INVOKER on purpose. Everything here runs as the service role, which
  is not subject to RLS anyway, so there is nothing for definer rights to buy —
  and a definer function is another thing that has to be GRANT-audited. See
  2026_definer_grant_sweep.sql for why that list is kept as short as possible.
*/
create or replace function public.cron_cursor_advance(
  p_name text, p_at timestamptz, p_id uuid, p_count int, p_wrapped boolean
) returns void language sql security invoker as $$
  insert into cron_cursors (name, cursor_at, cursor_id, last_run_at, processed_total, wrapped_count)
  values (p_name, p_at, p_id, now(), greatest(p_count, 0), case when p_wrapped then 1 else 0 end)
  on conflict (name) do update set
    cursor_at       = excluded.cursor_at,
    cursor_id       = excluded.cursor_id,
    last_run_at     = now(),
    processed_total = cron_cursors.processed_total + greatest(p_count, 0),
    wrapped_count   = cron_cursors.wrapped_count + case when p_wrapped then 1 else 0 end;
$$;

revoke execute on function public.cron_cursor_advance(text, timestamptz, uuid, int, boolean)
  from public, anon, authenticated;
