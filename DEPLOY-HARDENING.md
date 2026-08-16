# Hardening release — deploy runbook

Fifteen commits, `5537f33..663b01e`. Build passes, `tsc --noEmit` clean, working tree clean.
**Nothing is pushed yet** — run `git push origin main` when you're ready.

---

## Order matters

Run the migrations **before or at the same time as** the deploy. Never after.

Most of the code survives an un-migrated database (the paywall, credit metering and
the contact forms all degrade rather than break), but **the metrics layer does not**:
without `2026_metrics_layer.sql` every ledger upsert fails on a missing conflict
target, so the dashboard chart stays empty and paid bank analyses are charged and
silently discarded.

Run them in this order:

1. `2026_hardening.sql` — RLS on billing tables, locked-down RPCs, subscription periods
2. `2026_metrics_layer.sql` — merge key + GST columns for the aggregation layer
3. `2026_tenancy.sql` — the three tenancy holes
4. `2026_signup_trigger.sql` — **manual check required first**, see below

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

## Step 1b — `2026_metrics_layer.sql` then `2026_tenancy.sql`

`2026_metrics_layer.sql` adds the `(org_id, period)` merge key the aggregation layer
upserts on, plus `gst_turnover`/`gst_tax`, and drops the `default 0` on
`cash_balance`/`net_profit` so NULL can mean "unknown" rather than "zero".

`2026_tenancy.sql` closes the three RLS holes. One line in it matters more than the
rest — `grant execute on function public.user_org_rank(uuid) to authenticated`. Every
new write policy calls that function through the anon+cookie client; without the grant
the whole app would read fine and save nothing.

After running it, sanity-check that writes still work:

```sql
-- expect your own rank (5 for an owner), not an error
select public.user_org_rank('<one-of-your-org-uuids>');
```

Then sign in and add one sales order through the UI. If it saves, the policies are right.

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

## Still false on the marketing site — not yet fixed

A full claim-by-claim audit found these. None are fixed yet; they are the next tranche.

| Claim | Where | Reality |
|---|---|---|
| "130+ Business Calculators" | landing | 52 real calculators. `config.ts` already says the honest "50+" |
| "300+ runnable AI agents" | landing | 386 defined, **292 runnable**. 80 need a Gemini key, 14 video agents are hard-blocked. The features page already says "250+" — the two pages contradict each other |
| "Workflow automation + approvals" | landing + Growth plan | `runWorkflow()` inserts the text "steps executed successfully" and executes nothing |
| "Pipeline + AI Lead Scoring" | landing + features | `/pipeline` is a plain kanban; grep for `score` returns zero hits |
| "named by ChatGPT, Gemini & Perplexity" | landing | only Gemini (or Groq) is ever queried |
| "62 Integrations" | landing | the count is right, but nothing syncs — 16 have a credential test, 46 just store a key, 0 move data |
| "Public API + webhooks" | Business plan | the API is real and good; outbound webhooks do not exist in any form |
| "Real email / WhatsApp automations" | Premium plan | WhatsApp is `wa.me` links only. Email campaigns are real but **super-admin-only** — no paying customer on any tier can open the page |
| "Scheduled reports" | landing + features | no scheduler exists |
| "White-label & custom branding" | Business plan | `logo_url` is saved and never rendered anywhere |
| "SSO / SAML" | Enterprise | no implementation; needs Supabase Pro |
| "Custom integrations (Tally, ERP, Shopify)" | Enterprise | Tally is a form field with placeholder `http://localhost:9000` — unreachable from Vercel by design |
| Industry count | four places | says 25, 26, 26 and "27+" |

Also worth fixing: seat limits are not enforced on any tier (₹799 and ₹39,999 both buy
unlimited users), and `PLAN_RANK` in `integrations.ts` is missing `solo` and `business`,
so a ₹39,999 Business workspace is treated as Starter and capped at **2** integrations
while Starter gets 3.

## Known, deliberately not changed

- **No auto-renewal.** Cashfree recurring mandates aren't wired up, so customers must
  re-pay manually when a period ends. There's an in-app banner from 7 days out, but
  **no renewal email** — worth adding before the first cohort lapses.
- **Logged-out visitors can still browse the app shell** and see demo data. Every AI
  action is locked; the pages are marketing surface.
- **`/api/priorities`** is authenticated but not metered (marked "free core navigation").
- `chat_threads` / `chat_messages` exist in the schema but nothing reads or writes them —
  chat history still isn't persisted.
