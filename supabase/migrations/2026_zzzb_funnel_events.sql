/* ===========================================================================
   YOU CANNOT CURRENTLY ANSWER "HOW MANY PEOPLE SAW PRICING AND DIDN'T BUY".

   There is no analytics of any kind in this product. No page views, no
   signup-started, no checkout-started, no conversion. package.json has no
   posthog, no plausible, no GA, no Vercel Analytics; layout.tsx has no script
   tag; there is no events table. The only funnel-ish view is a count of orgs by
   plan.

   That means every decision about the funnel — including which of the gaps
   found today to fix first — is a guess, and none of the fixes can be measured
   after the fact. Shipping a better health check and a calculator SEO surface
   without this is shipping into the dark.

   WHY FIRST-PARTY AND NOT A THIRD-PARTY SCRIPT

   1. The visitors are Indian SME owners, often on mid-range Android over patchy
      mobile data. A third-party analytics bundle is 30-50 KB of blocking
      JavaScript on pages whose whole argument is that they load instantly.
   2. Ad blockers eat 20-40% of those events, and they do not eat them randomly
      — they eat them disproportionately from the more technical visitors.
   3. Consent. A first-party table holding a hashed IP and a page name needs a
      far simpler consent story under the DPDP Act than a third-party tracker
      that sets its own cookies.
   4. It is about forty lines. The events we need are countable, not a
      behavioural graph.

   WHAT IS DELIBERATELY NOT STORED

   No raw IP, no user agent string, no cookie, no cross-site identifier, no
   personal data. `visitor` is a salted SHA-256 of the IP truncated to 16 hex
   characters — enough to tell two visits apart within a day, useless for
   identifying anyone, and it rotates because the salt includes the date.

   That is a real trade: we can count PEOPLE per day but cannot follow one
   across days. For funnel counts that is sufficient, and it is the version that
   does not require asking a stranger for permission to be watched.

   Safe to run, and safe to run twice.
   =========================================================================== */

create table if not exists funnel_events (
  id          bigserial primary key,
  /* The step. A short, stable name — see FUNNEL_EVENTS in lib/funnel.ts. */
  event       text not null,
  /* Where it happened, path only, never a query string (they carry PII). */
  path        text,
  /* Salted daily hash of the IP. Not reversible, not stable across days. */
  visitor     text,
  /* Which workspace, when there is one. Null for anonymous steps. */
  org_id      uuid references organizations(id) on delete set null,
  /* Anything countable and non-personal: plan id, score band, error kind. */
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

/*
  The two queries this table exists to answer:
    "how many of each step, per day"      -> (event, created_at)
    "how many distinct people per step"   -> (event, visitor)
*/
create index if not exists idx_funnel_event_time    on funnel_events(event, created_at desc);
create index if not exists idx_funnel_event_visitor on funnel_events(event, visitor);

/*
  RLS ON, NO POLICIES. Service-role only.

  This is written by server routes with the service client and read by the
  superadmin console. A tenant has no business reading it — it is cross-tenant
  by nature — and an anonymous visitor writing directly to it would make every
  number in it a lie. No policy means denied to anon and authenticated, which
  is the whole intent.
*/
alter table funnel_events enable row level security;

/*
  A RETENTION RULE, WRITTEN DOWN RATHER THAN ASSUMED.

  Funnel counts are useful for weeks, not years, and an events table with no
  ceiling is the one that quietly becomes the largest thing in the database.
  90 days is long enough to compare a month against the month before it.

  Called from the nightly cron sweep. Deliberately a function rather than a
  trigger: a delete on every insert would make the write path pay for it.
*/
create or replace function cortex_prune_funnel_events(p_days int default 90)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from funnel_events where created_at < now() - (p_days || ' days')::interval;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.cortex_prune_funnel_events(int) from public, anon, authenticated;
grant  execute on function public.cortex_prune_funnel_events(int) to service_role;

/* ---------------------------------------------------------------- verify ---
   Expect one row for the table, and zero rows from the reachability check.
   -------------------------------------------------------------------------- */
select 'funnel_events' as object,
       case when to_regclass('public.funnel_events') is not null then 'created' else 'MISSING' end as state,
       case when (select relrowsecurity from pg_class where relname = 'funnel_events') then 'rls on' else 'RLS OFF' end as rls;

select p.proname as reachable_by_strangers
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'cortex_prune_funnel_events'
   and (has_function_privilege('anon', p.oid, 'execute')
     or has_function_privilege('authenticated', p.oid, 'execute'));
