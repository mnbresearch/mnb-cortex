/* ===========================================================================
   THE DEFAULT CASH ALERT FIRES FOR EVERY WORKSPACE, ON DAY ONE, FOREVER.

   2026_default_alert_rules.sql seeds `cash < 30` and documents it as:

       cash        < 30       Days of runway. Under a month is the point at
                              which an owner needs to be doing something.

   The metric it compares against is not days. lib/metrics.ts:457 emits

       metric_key: "cash", value: months, unit: "months"

   — runway in MONTHS, one decimal place. So the shipped default reads "warn me
   when runway drops below thirty months", which is true of essentially every
   business that has ever existed, including healthy ones. Every workspace that
   emits a runway figure at all trips this rule on the first recompute and on
   every recompute after it.

   WHY THAT IS WORSE THAN A MERELY WRONG NUMBER.

   The migration that introduced it argues the case against itself, at length,
   two paragraphs above the bug:

       "A default that fires constantly is worse than no default: people learn
       to ignore the sender, and then the one that mattered is ignored too."

   That is exactly what shipped. This product's entire proposition is that when
   Cortex emails you, something is actually wrong — and the very first email a
   new customer receives is a false alarm about a company with three years of
   runway. The unit mismatch turns the signature feature into training material
   for ignoring us.

   THE FIX, AND WHY 3 RATHER THAN 1.

   Three months. The original intent was "under a month", but that intent was
   written against a daily figure; on a monthly figure, one month of runway is
   far past the point where an early-warning product has been useful. Three
   months is the horizon at which an owner can still act — negotiate terms,
   chase receivables, delay a purchase — which is what the alert is for.
   metrics.ts already bands this metric at 6/3 (`band(months, 6, 3)`), so 3 is
   the threshold the product's own status colours already call red.

   EXISTING ROWS.

   Updated, but only where the row is still exactly the seeded default
   (metric 'cash', op '<', threshold 30). A customer who deliberately chose a
   different number keeps it. Nobody deliberately chose thirty months.

   Safe to run, and safe to run twice.
   =========================================================================== */

update alert_rules
   set threshold = 3
 where metric_key = 'cash'
   and op = '<'
   and threshold = 30;

/* And for every workspace created from now on. Byte-identical to the function
   in 2026_default_alert_rules.sql apart from the one threshold, including the
   exception handler — a workspace with no default rules is a degraded product,
   a signup that fails is no product. */
create or replace function cortex_seed_default_alert_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into alert_rules (org_id, metric_key, op, threshold, enabled)
  values (new.id, 'receivables', '>', 500000, true),
         (new.id, 'risk',        '>', 60,     true),
         -- MONTHS of runway, matching lib/metrics.ts. Was 30, which is the
         -- same number read as days and fires for every solvent business.
         (new.id, 'cash',        '<', 3,      true)
  on conflict (org_id, metric_key, op) do nothing;
  return new;
exception when others then
  return new;
end $$;

/* The definer sweep in 2026_zzz_definer_final_lockdown.sql runs after this file
   and will restrict the replaced function again — but `create or replace`
   preserves the existing ACL, so this does not reopen anything in between. */

/* ---------------------------------------------------------------- verify ---
   Expect zero rows. Any row is a workspace still holding the months-as-days
   default, which will email its owner about healthy cash every single day.
   -------------------------------------------------------------------------- */
select org_id, metric_key, op, threshold
  from alert_rules
 where metric_key = 'cash' and op = '<' and threshold >= 12
 order by org_id;
