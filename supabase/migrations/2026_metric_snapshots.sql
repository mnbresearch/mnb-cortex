/*
  Daily metric snapshots — so "what changed this week" is a fact, not a claim.

  WHY THIS DID NOT EXIST, AND WHY THAT WAS A PROBLEM.

  `health_metrics` holds ONE row per (org_id, metric_key) and recomputeMetrics()
  upserts over it on every write. It is a picture of right now, and it has no
  memory: the moment receivables move from ₹12L to ₹19L, the ₹12L is gone.

  Everything Cortex sells is a change over time. The positioning is early
  warning. The Practice plan bullet is literally "Whose receivables moved this
  week". The weekly brief is supposed to say what moved. None of that was
  computable, because nothing anywhere retained yesterday's number — so the
  bullet was a promise with no mechanism behind it.

  This is that mechanism: an append-only row per workspace, per metric, per day.

  WHY ONE ROW PER DAY AND NOT PER RECOMPUTE.

  recomputeMetrics() runs inline after every write. A busy workspace importing a
  spreadsheet triggers it hundreds of times in a minute, and storing each would
  be both enormous and useless — the question is never "what did receivables do
  between 14:02 and 14:03". The primary key is (org_id, metric_key, as_of) and
  the write is an upsert, so the last recompute of a day wins and a day costs
  one row per metric. Roughly 12 metrics x 365 days = 4,400 rows per workspace
  per year, which is nothing.

  WHY `numeric` AND NOT THE WHOLE ROW.

  Only the value is kept. Labels, units and status bands are presentation and
  live in health_metrics, where they are always current; copying them here would
  create two sources of truth for the same string and guarantee they diverge.
*/

create table if not exists metric_snapshots (
  org_id     uuid not null references organizations(id) on delete cascade,
  metric_key text not null,
  as_of      date not null,
  value      numeric not null,
  created_at timestamptz not null default now(),
  primary key (org_id, metric_key, as_of)
);

/* The only query this table serves: one org, one metric, walking back in time. */
create index if not exists metric_snapshots_lookup
  on metric_snapshots (org_id, metric_key, as_of desc);

alter table metric_snapshots enable row level security;

/*
  Read-only to members. Nothing in the app writes here through a user session —
  recomputeMetrics() uses the service role — and a history a tenant can edit is
  a history that cannot be trusted to show what actually happened.
*/
drop policy if exists "members read metric_snapshots" on metric_snapshots;
create policy "members read metric_snapshots" on metric_snapshots
  for select using (org_id in (select user_org_ids()));

/*
  ---------------------------------------------------------------------------
  What moved, and by how much.

  Compares each metric's latest value against the newest snapshot at least
  `p_days` old. Note "at least", not "exactly": a workspace that was not touched
  last Tuesday has no Tuesday row, and an exact-date lookup would report nothing
  moved rather than comparing against the most recent reading before then.

  `previous_as_of` is returned so the caller can SAY which date it compared
  against. "Receivables up 38% since 28 August" is a sentence an owner can
  check; "receivables up 38% this week" from a comparison against an unknown
  date is one they cannot.

  security invoker, so RLS applies and this cannot be used to read across
  tenants. The org_billing_guard migration explains why definer rights on a
  tenant-scoped function is the mistake that keeps being made.
*/
drop function if exists cortex_metric_movement(uuid, int, numeric);

create function cortex_metric_movement(
  p_org uuid,
  p_days int default 7,
  p_min_pct numeric default 0
)
returns table (
  metric_key     text,
  current_value  numeric,
  previous_value numeric,
  previous_as_of date,
  delta          numeric,
  delta_pct      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with latest as (
    select s.metric_key, s.value, s.as_of
      from metric_snapshots s
     where s.org_id = p_org
       and s.as_of = (
         select max(s2.as_of) from metric_snapshots s2
          where s2.org_id = p_org and s2.metric_key = s.metric_key
       )
  ),
  prior as (
    select distinct on (s.metric_key) s.metric_key, s.value, s.as_of
      from metric_snapshots s
     where s.org_id = p_org
       and s.as_of <= current_date - p_days
     order by s.metric_key, s.as_of desc
  )
  select
    l.metric_key,
    l.value                                                   as current_value,
    p.value                                                   as previous_value,
    p.as_of                                                   as previous_as_of,
    (l.value - p.value)                                       as delta,
    /*
      Percentage is NULL, not zero, when the previous value was zero. Going
      from ₹0 to ₹5,00,000 is not a 0% change and it is not an infinite one;
      it is a change that a percentage cannot describe, and the caller should
      render the absolute figure instead of a made-up ratio.
    */
    case when p.value = 0 then null
         else round(((l.value - p.value) / abs(p.value)) * 100, 1) end as delta_pct
  from latest l
  join prior p on p.metric_key = l.metric_key
  where p_min_pct <= 0
     or (p.value <> 0 and abs((l.value - p.value) / abs(p.value)) * 100 >= p_min_pct)
  order by
    case when p.value = 0 then null
         else abs((l.value - p.value) / abs(p.value)) end desc nulls last,
    abs(l.value - p.value) desc
$$;

revoke all on function cortex_metric_movement(uuid, int, numeric) from public, anon;
grant execute on function cortex_metric_movement(uuid, int, numeric) to authenticated, service_role;

/*
  ---------------------------------------------------------------------------
  Seed today from whatever health_metrics currently holds.

  Without this the feature is silent for a week after deployment, which reads as
  broken. This gives every existing workspace one honest data point — today's —
  so the comparison starts working as soon as there is a second one, and never
  claims to know a value from before this migration ran.
*/
insert into metric_snapshots (org_id, metric_key, as_of, value)
select h.org_id, h.metric_key, current_date, h.value
  from health_metrics h
 where h.value is not null
on conflict (org_id, metric_key, as_of) do nothing;
