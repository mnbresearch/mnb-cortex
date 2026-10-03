/*
  The nightly sweep was locking out customers whose mandate was about to debit.

  ============================================================================
  WHAT HAPPENED
  ============================================================================

  src/lib/entitlement.ts:21 sets RENEWAL_GRACE_DAYS = 3, and says why:

      "UPI Autopay requires 24h pre-debit notice, bank retries are routine and
       a webhook can lag. Refusing a paying customer at the exact stroke of
       their period end would turn ordinary settlement lag into an outage for
       someone who has actually paid."

  That grace is applied inside effectiveStatus(), and effectiveStatus() opens
  with:

      if (s !== "active") return s;

  So the grace exists only while the stored row still says `active`.

  expire_lapsed_subscriptions() — run FIRST by the 04:30 cron
  (src/app/api/cron/autopilot/route.ts) — flipped the row to `expired` the
  moment `subscription_ends_at < now()`, with no grace window and no reference
  to `autorenew_status`. One UPDATE and the grace became unreachable for that
  workspace, permanently.

  Three things then happened to a customer who was paying correctly, on the
  same cron run:

    LOCKED OUT      lib/billing.ts → status "expired" → paywall.ts → the
                    full-screen "Your subscription has ended" modal, over a
                    product they are still paying for.

    NOT WATCHED     autopilot's own entitled() check returns false, so their
                    nightly analysis, alerts and collections are skipped. The
                    route's docblock says this is the exact failure it was
                    written to fix — it fixed entitled() and left step 1 to
                    defeat it.

    DUNNED          lib/renewal-email.ts skips a live mandate only while
                    `status === "active"`. After the sweep, status is
                    `expired`, the skip misses, and we send "Your MNB Cortex
                    plan has ended — Renew my plan". We invite a double
                    payment from someone whose mandate is live.

  ============================================================================
  THE FIX
  ============================================================================

  Expire on the same terms the application uses, rather than on terms that
  contradict it:

    · a mandate that is ACTIVE or INITIALIZED gets the 3-day grace
    · everything else expires at the end of its period, exactly as before

  INITIALIZED is included deliberately. It is what POST
  /api/pay/cashfree/subscription writes the moment a mandate is created, and
  Cashfree may not move it to ACTIVE until the first debit authorises. A
  customer mid-authorisation is the last one to lock out.

  THE GRACE IS A FLOOR, NOT A LICENCE. Three days after the period ends the
  row expires whatever the mandate says, so a mandate that is live at the
  gateway but never debits cannot hold a workspace open indefinitely.

  Keeping the window here in sync with RENEWAL_GRACE_DAYS matters, so the
  constant is named in the body and scripts/test-renewal-grace.mjs asserts the
  two agree — the same TS-to-SQL pinning used for cortex_norm_name and the
  practice pool.

  `create or replace`, same signature, same return. No data is touched beyond
  the rows this function was always meant to touch; it simply touches fewer.
*/

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
