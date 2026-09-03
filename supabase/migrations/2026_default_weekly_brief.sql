/*
  Give every workspace a weekly brief, on by default.

  WHY NOTHING ARRIVED BEFORE.

  All the machinery exists and works: `scheduled_reports` rows, an `isDue()`
  cadence check, the autopilot cron that calls `runScheduledReports()` daily,
  the branded email sender, and the AI content generator behind every mode. The
  only missing piece was a row. Nobody had one, so nothing was ever due, so
  nothing was ever sent.

  That is the entire day-7 problem. Cortex writes an `alerts` row and waits to
  be noticed; the owner's task board is in the app; there is no artefact that
  arrives on its own. Nothing brings him back on a Monday. One row per workspace
  changes that, and it is the cheapest retention work available in this codebase
  because everything downstream of it was already built and tested.

  THE TRAP THIS AVOIDS.

  The naive version creates the row from the cron, or from a backfill that runs
  on every deploy. Then a customer who turns the brief OFF gets it re-enabled
  the next day, which is worse than never having sent one — it is a product
  ignoring an explicit instruction, and the next step is a spam complaint
  against the sending domain.

  So: insert only where the workspace has NO 'brief' row AT ALL, active or not.
  Setting `is_active = false` leaves the row in place, which permanently records
  the decision. This migration is therefore safe to re-run and will never
  resurrect a brief somebody switched off.
*/

insert into scheduled_reports (org_id, mode, cadence, is_active)
select o.id, 'brief', 'weekly', true
  from organizations o
 where not exists (
   select 1 from scheduled_reports s
    where s.org_id = o.id and s.mode = 'brief'
 );

/*
  `send_to` is deliberately left NULL: runScheduledReports() resolves the
  workspace owner at send time. Freezing an address here would keep mailing a
  founder who has since left the company.
*/

/*
  Do the same for workspaces created from now on.

  A trigger rather than application code, so it cannot be missed by a signup
  path that does not go through ensureWorkspace() — the DB signup trigger
  creates organizations directly, which is exactly how earlier provisioning bugs
  in this project happened.
*/
create or replace function cortex_default_weekly_brief()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into scheduled_reports (org_id, mode, cadence, is_active)
  values (NEW.id, 'brief', 'weekly', true)
  on conflict do nothing;
  return NEW;
exception when others then
  -- A missing brief must never be the reason a signup fails.
  return NEW;
end $$;

drop trigger if exists cortex_org_default_brief on organizations;
create trigger cortex_org_default_brief
  after insert on organizations
  for each row
  execute function cortex_default_weekly_brief();
