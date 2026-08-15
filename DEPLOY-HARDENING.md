# Hardening release — deploy runbook

Ten commits, `5537f33..952560e`. Build passes, `tsc --noEmit` clean, working tree clean.
**Nothing is pushed yet** — run `git push origin main` when you're ready.

---

## Order matters

Run the migration **before or at the same time as** the deploy. Never after.

The code is written to survive an un-migrated database (the paywall, credit metering
and the contact forms all degrade rather than break), but you get the security fixes
only once the SQL has run.

---

## Step 1 — `supabase/migrations/2026_hardening.sql`

Paste into the Supabase SQL editor for project `krklgsmeamnxeawdlmka` and run. Idempotent.

It does four things:

1. **RLS on `credit_ledger` and `org_billing_log`.** These were created without it. With
   Supabase's default grants, any signed-in user of *any* app on this project — including
   Toppers Hub Academy — could read every workspace's billing history.
2. **Revokes `EXECUTE` from `anon`/`authenticated`** on `grant_credits`, `charge_credits`,
   `sync_allowance`, `bump_memory_refs` and the new rate-limit functions. `grant_credits`
   reachable by any logged-in user was a self-serve credit printer.
   `api_ingest`, `api_metrics`, `public_report` and `seed_demo_data` are deliberately left
   executable — they're called with the anon client and check their own keys.
3. **Subscription periods** (`subscription_ends_at`, `subscription_cycle`) plus
   `expire_lapsed_subscriptions()`.
4. **`rate_limits` table + `rate_limit_hit()`** for the public endpoints.

### Before you run it — check your active customers

The backfill recovers each customer's billing cycle by matching what they actually paid
against the plan catalogue, dates the period from their payment, and only touches
workspaces that have a payment on record. Workspaces with no payment (your own
businesses, manual grants) keep a `NULL` end date, which means *never expires*.

Sanity-check what it will do:

```sql
select o.id, o.name, o.plan, o.subscription_status, s.amount, s.created_at
  from organizations o
  left join subscriptions s on s.org_id = o.id and s.status = 'active'
 where o.subscription_status = 'active';
```

Anyone whose payment date is more than one period ago will be flipped to `expired` by the
first nightly cron. If that's not what you want for a specific customer, give them a fresh
period from the Super Admin panel (`subscriptionDays`) after migrating.

## Step 2 — `supabase/migrations/2026_signup_trigger.sql`

**Do not run this blind.** It replaces `handle_new_user()`, which lives on the Supabase
project shared with Toppers Hub Academy. First run:

```sql
select prosrc from pg_proc where proname = 'handle_new_user';
```

If the body is only the profile + organizations + memberships insert from `rls.sql`, run
the file. If Toppers Hub has added anything of its own, merge by hand instead — the file
has the rollback body at the bottom.

Also confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel before running it. Once the
trigger stops creating workspaces, `ensureWorkspace()` is the only path, and it returns
early without that key.

## Step 3 — deploy

```bash
git push origin main
```

## Step 4 — verify in production

```bash
# should be 401, not a generated report
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://cortex.mnbresearch.com/api/report

# should be 401 — this used to send mail from your domain to anyone
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://cortex.mnbresearch.com/api/brief/email \
  -H 'Content-Type: application/json' -d '{"to":"test@example.com"}'

# should be 200 — the fix for the live bug
curl -s -o /dev/null -w '%{http_code}\n' https://cortex.mnbresearch.com/icon.svg

# expiry sweep + housekeeping; returns {"ok":true,"expired":N,...}
curl -s "https://cortex.mnbresearch.com/api/cron/autopilot?secret=$CRON_SECRET"
```

Then sign in and confirm the dashboard, chat and one calculator still work, and that
Cashfree checkout completes on a real ₹799 Solo purchase.

---

## What changed, briefly

**Money that was leaking**

- Every AI endpoint ran the model for anonymous callers. `chargeForMode()` now fails
  closed; 401 for no session, 402 for no credits.
- `/api/report` was completely unmetered.
- `/api/brief/email` was an open relay — unauthenticated, arbitrary recipient, your
  Resend domain. Now auth-required, metered, and always sends to the account owner.
- `/api/inquiry` and `/api/access-request` had the same open-relay shape. Now rate
  limited per email / IP / globally.
- `/api/act` `op=send` let any trial account send unlimited mail. Now 50/day per
  workspace, charged, refunded on failure.
- The autopilot cron ran AI for expired and suspended workspaces.
- The public AI Visibility lead magnet is kept, now throttled (2/email/day,
  3/IP/day, 200/day global) and checked before any model spend.

**Money that wasn't being collected**

- A single Cashfree payment set `subscription_status = 'active'` forever, with no
  renewal job, while `/terms` promises 30-day renewal. Plans now run for the period
  bought (30 or 365 days), stack if you pay early, and lapse via the nightly cron.

**Payments correctness**

- A failure after the payment was claimed left the customer charged with nothing
  activated, and every webhook retry answered "already settled".
- Credit top-up grants are now idempotent per order, so a retry can't double-grant.
- An order recorded as `amount_mismatch` is reported honestly instead of silently
  claiming success.

**Cleanup**

- Deleted the dead Razorpay path (4 routes, no keys, no callers).
- Dropped `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai` — imported nowhere.
- Committed `package-lock.json` so Vercel stops re-resolving the tree each deploy.

---

## Known, deliberately not changed

- **No auto-renewal.** Cashfree recurring mandates aren't wired up, so customers must
  re-pay manually when a period ends. There's an in-app banner from 7 days out, but
  **no renewal email** — worth adding before the first cohort lapses.
- **Logged-out visitors can still browse the app shell** and see demo data. Every AI
  action is locked; the pages are marketing surface.
- **`/api/priorities`** is authenticated but not metered (marked "free core navigation").
- `chat_threads` / `chat_messages` exist in the schema but nothing reads or writes them —
  chat history still isn't persisted.
