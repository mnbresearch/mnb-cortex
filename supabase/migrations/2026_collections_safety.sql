/*
  The brakes you need before strangers can use this.

  Collections sends messages, in a customer's name, to people who never signed
  up for anything. Everything in 2026_collections.sql is a per-workspace control
  the customer sets. This file adds the two controls the OPERATOR needs, which
  are a different problem:

    1. a global stop, so a misfire can be halted for everyone in seconds without
       waiting for a deploy — the difference between one bad hour and one bad day
    2. a per-workspace circuit breaker that trips itself on repeated failures,
       so a workspace with a broken WhatsApp token does not spend all day
       retrying and burning its own provider quota

  Neither is a nice-to-have at launch. A feature that messages third parties
  needs an off switch that does not require an engineer, and it needs to notice
  when it is failing rather than continuing cheerfully.
*/

-- ------------------------------------------------------------ global stop

/*
  One row. `id = true` so a second row is impossible — a kill switch with two
  rows and disagreeing values is worse than none, because the reader picks one
  arbitrarily.
*/
create table if not exists platform_switches (
  id                  boolean primary key default true check (id),
  collections_enabled boolean not null default true,
  /* Shown to the operator and in the health check so nobody has to guess why. */
  reason              text,
  updated_at          timestamptz not null default now(),
  constraint one_row check (id)
);

insert into platform_switches (id) values (true) on conflict (id) do nothing;

alter table platform_switches enable row level security;

/*
  Readable by any signed-in user — it is a single boolean about the platform,
  not about any workspace, and the collections UI needs to explain itself when
  sending is paused. Writable only by the service role, i.e. by a super-admin
  action, never from the browser.
*/
drop policy if exists "anyone may read switches" on platform_switches;
create policy "anyone may read switches" on platform_switches for select using (true);

create or replace function cortex_collections_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select collections_enabled from platform_switches where id), true);
$$;

grant execute on function cortex_collections_enabled() to authenticated, service_role;

-- ------------------------------------------------- per-workspace breaker

/*
  Trip a workspace's collections after repeated send failures.

  The realistic failure is an expired WhatsApp token or a revoked email key. The
  engine already marks each attempt failed, but without this it would keep
  presenting the same messages every run — the customer sees nothing working and
  we spend their provider quota discovering it again each time.

  Counted over a rolling window rather than all time, so one bad afternoon
  months ago does not keep a healthy workspace switched off.
*/
alter table collection_policies add column if not exists tripped_at    timestamptz;
alter table collection_policies add column if not exists tripped_reason text;

create or replace function cortex_collections_trip_check(p_org uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  fails int;
  sends int;
begin
  select count(*) into fails
    from collection_messages
   where org_id = p_org and status = 'failed'
     and created_at > now() - interval '24 hours';

  select count(*) into sends
    from collection_messages
   where org_id = p_org and status = 'sent'
     and sent_at > now() - interval '24 hours';

  /*
    Five consecutive-ish failures with nothing getting through. Requiring
    sends = 0 matters: a busy workspace sending 200 reminders a day will have
    the odd bounce, and tripping it for that would be worse than the failures.
  */
  if fails >= 5 and sends = 0 then
    update collection_policies
       set enabled = false,
           tripped_at = now(),
           tripped_reason = fails || ' sends failed in 24h with none delivered — check your email or WhatsApp credentials'
     where org_id = p_org and enabled = true;
    return true;
  end if;
  return false;
end $$;

revoke all on function cortex_collections_trip_check(uuid) from public, anon;
grant execute on function cortex_collections_trip_check(uuid) to service_role;

-- ------------------------------------------------------- operator control

/*
  Flip the global switch. Service-role only, called by the super-admin console.
*/
create or replace function cortex_set_collections_switch(p_on boolean, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update platform_switches
     set collections_enabled = p_on,
         reason = case when p_on then null else coalesce(p_reason, 'paused by operator') end,
         updated_at = now()
   where id;
  return p_on;
end $$;

revoke all on function cortex_set_collections_switch(boolean, text) from public, anon, authenticated;
grant execute on function cortex_set_collections_switch(boolean, text) to service_role;
