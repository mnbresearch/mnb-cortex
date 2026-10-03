/* ===========================================================================
   RUN THIS IN THE SUPABASE SQL EDITOR. ONE PASTE, EVERYTHING OUTSTANDING.

   Three function replacements and a verification block. No data is touched,
   nothing is dropped, no return type changes, and running it twice is
   harmless. It takes effect immediately for every workspace.

   WHAT IS IN HERE, AND WHY EACH ONE MATTERS
   ---------------------------------------------------------------------------

   1. expire_lapsed_subscriptions()   ← THE URGENT ONE

      The nightly cron's FIRST step flipped a paid workspace to `expired` the
      moment its period ended, with no renewal grace and no reference to
      autorenew_status. entitlement.ts grants a live mandate 3 days — UPI
      Autopay gives 24h pre-debit notice and bank retries are routine — but
      effectiveStatus() opens with `if (s !== "active") return s`, so once the
      sweep wrote `expired` the grace was unreachable forever.

      Three things then happened on the same run to a customer paying
      correctly: locked out behind "Your subscription has ended"; their
      autopilot skipped; and emailed "Your plan has ended — Renew my plan"
      while their mandate was about to debit. That last one invites a double
      payment.

      The application code is already deployed and already correct. THIS IS
      THE HALF THAT IS STILL LIVE IN YOUR DATABASE.

   2. cortex_msme_exposure()

      `current_date - dated` resolves in the session timezone, which is UTC on
      Supabase. One day short means `age_days > 45` is false on the morning a
      bill actually crosses, so /msme reports ZERO exposure. Under s.43B(h)
      that payment is a disallowed deduction, so this is a tax position, not a
      label. (Carried over from RUN-NOW-msme-ist.sql — if you already ran that
      one, this is a harmless no-op.)

   3. cortex_fn_has()                 ← SO THIS CANNOT HAPPEN SILENTLY AGAIN

      /api/health probes a migration by SELECTing a column it introduced.
      Both fixes above only REPLACE A FUNCTION — no new column — so the health
      check was structurally blind to them. That is why #2 sat unapplied for
      two days while the status page said "Schema migrations: operational".

      This helper lets the health check read pg_proc and report an unapplied
      function migration out loud. Read-only, returns a boolean and never the
      source, scoped to our own functions, execute revoked from everyone but
      the service role.

   AFTER RUNNING: open https://cortex.mnbresearch.com/api/health. "Schema
   migrations" must say operational. If either fix had failed to apply, it now
   names the file and the consequence instead of staying green.
   =========================================================================== */

/* ========================= 1. THE RENEWAL GRACE ========================= */
create or replace function expire_lapsed_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with lapsed as (
    update organizations
       set subscription_status = 'expired'
     where subscription_status = 'active'
       and subscription_ends_at is not null
       and subscription_ends_at <
           case
             /*
               RENEWAL_GRACE_DAYS = 3 (src/lib/entitlement.ts). A live mandate
               is given the same three days the application already grants it,
               so the sweep stops contradicting effectiveStatus().
             */
             when upper(coalesce(autorenew_status, '')) in ('ACTIVE', 'INITIALIZED')
               then now() - interval '3 days'
             else now()
           end
    returning id
  )
  select count(*) into n from lapsed;
  return coalesce(n, 0);
end $$;

revoke execute on function expire_lapsed_subscriptions() from public, anon, authenticated;
-- The nightly cron calls this with the service role.

/* ========================= 2. THE 43B(h) IST WINDOW ===================== */
create or replace function cortex_msme_exposure(p_org uuid)
returns table (
  party            text,
  udyam_category   text,
  invoice_count    bigint,   -- bills PAST the window
  total_amount     numeric,
  oldest_days      int,
  window_days      int,
  past_window      boolean,
  other_count      bigint,   -- bills still inside the window
  other_amount     numeric   -- and their value, reported but never counted
)
language sql
stable
security invoker
set search_path = public
as $$
  with payables as (
    select i.party,
           i.amount,
           coalesce(i.issue_date, i.created_at::date) as dated,
           cortex_norm_name(i.party)                  as norm
      from invoices i
     where i.org_id = p_org
       and lower(i.type) = 'payable'
       /*
         Case-insensitive. A Tally or Vyapar export writes "Paid", and the old
         `<> 'paid'` let those bills through — inflating a tax figure with money
         that had already gone out.
       */
       and lower(coalesce(i.status, 'pending')) <> 'paid'
  ),
  matched as (
    select p.*,
           v.udyam_category,
           /* Per BILL, not per party: two bills from one supplier can sit under
              different agreements, and min() applied the harsher window to bills
              it did not govern. */
           case when coalesce(v.has_written_agreement, true) then 45 else 15 end as window_days,
           /* IST, not the session's UTC. See the header: this comparison is a
              tax position, and a day short of it is a disallowed deduction
              reported as compliant. */
           ((now() at time zone 'Asia/Kolkata')::date - p.dated) as age_days
      from payables p
      left join vendors v
        on v.org_id = p_org
       and cortex_norm_name(v.name) = p.norm
  )
  select
    m.party,
    coalesce(m.udyam_category, 'unclassified')                                  as udyam_category,
    count(*) filter (where m.age_days > m.window_days)                          as invoice_count,
    coalesce(sum(m.amount) filter (where m.age_days > m.window_days), 0)        as total_amount,
    coalesce(max(m.age_days) filter (where m.age_days > m.window_days), 0)::int as oldest_days,
    min(m.window_days)                                                          as window_days,
    bool_or(m.age_days > m.window_days)                                         as past_window,
    count(*) filter (where m.age_days <= m.window_days)                         as other_count,
    coalesce(sum(m.amount) filter (where m.age_days <= m.window_days), 0)       as other_amount
  from matched m
  group by m.party, coalesce(m.udyam_category, 'unclassified')
  /* Worst exposure first; a party with nothing past the window sorts last. */
  order by coalesce(sum(m.amount) filter (where m.age_days > m.window_days), 0) desc,
           m.party asc
$$;

/* ========================= 3. THE FUNCTION-BODY PROBE =================== */
create or replace function cortex_fn_has(p_name text, p_needle text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = p_name
       /* Our own functions only. Not a general-purpose source oracle. */
       and (p.proname like 'cortex\_%' or p.proname like 'expire\_%')
       and p.prosrc like '%' || p_needle || '%'
  );
$$;

/*
  REVOKE **AND GRANT**.

  The first version of this file stopped at the revoke, under a comment saying
  "the health endpoint calls this with the service role" — which describes the
  caller, it does not grant it anything. A new function's only EXECUTE
  privilege is the implicit grant to PUBLIC; revoke that and service_role is
  left with nothing unless this project's default privileges happen to cover
  it. cortex_has_billing_guard, which the same health check calls two lines
  later, has always said `grant execute ... to authenticated, service_role`.

  Running this file WITHOUT the grant below applies both function fixes
  correctly and still leaves /api/health reporting "cannot verify", which
  reads exactly like the file was never run.
*/
revoke execute on function cortex_fn_has(text, text) from public, anon, authenticated;
grant execute on function cortex_fn_has(text, text) to service_role;

/* ===========================================================================
   VERIFY. Returns ONE ROW. All FOUR columns must be true.

   It reads each function's own source back out of the catalogue, so nothing
   except the replacements above actually being in place can satisfy it.

   The fourth column is the grant, checked separately from installation,
   because those are two different failures with two different fixes and the
   status page cannot tell them apart from the outside.
   =========================================================================== */

select
  (select prosrc like '%autorenew_status%' from pg_proc
    where proname = 'expire_lapsed_subscriptions' limit 1)  as renewal_grace_applied,
  (select prosrc like '%Asia/Kolkata%' from pg_proc
    where proname = 'cortex_msme_exposure' limit 1)         as msme_ist_applied,
  (select count(*) = 1 from pg_proc
    where proname = 'cortex_fn_has')                        as health_probe_installed,
  has_function_privilege(
    'service_role', 'public.cortex_fn_has(text, text)', 'EXECUTE'
  )                                                         as health_probe_executable;
