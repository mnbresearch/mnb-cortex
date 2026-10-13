# Cortex 6.45 — API platform, analytics, checkout follow-up, premium tiers

Commits `20e8f48`, `bbcdb7e`, `128a6b1` (on top of `bd69b2b`).

## Deploy order

1. `git push origin main`. Vercel builds and deploys.
   - The code runs on the old database. It falls back to v1 key behaviour, reads the follow-up mode as `off`, and skips usage counters.
2. Run `supabase/migrations/2026_zzzw_api_platform.sql` in the Supabase SQL editor. Every row of the final verify query must be `true`.
3. Run `supabase/migrations/2026_zzzx_checkout_followup.sql`. Every verify row must be `true`.
4. If not already done, run `2026_zzzv_media_sales_watch.sql`. The nightly backup lists `media_assets`, and reports it as a read error until that table exists.
5. Smoke test:
   - **Read key:** on `/developers`, create a read-only key. Then run:
     ```
     curl https://cortex.mnbresearch.com/api/v1/whoami -H "Authorization: Bearer <key>"
     curl "https://cortex.mnbresearch.com/api/v1/invoices?limit=2" -H "Authorization: Bearer <key>"
     ```
     Check that the response has `page.next_cursor`. Then request the next page with `&cursor=<that value>`. This confirms PostgREST's handling of the quoted cursor, which has only been tested against a fake.
   - **Revoke:** revoke the key. The same call must return `401` with `revoked_key`.
   - **OpenAPI:** `GET /api/v1/openapi.json` must return the contract.
   - **Follow-up:** `/superadmin` → *Abandoned-checkout follow-up*. Mode shows **Dry run**. Press *Send me a test* and check your inbox. Switch to **Live** only after that.

Order matters for one reason. Step 2 revokes the browser's write access to `api_keys`. Key creation now goes through the service role, so new code must be live before step 2. The old code cannot create keys once step 2 has run.

## Environment variables

No new required variables.

| Variable | Effect |
|---|---|
| `CHECKOUT_FOLLOWUP_MODE=off` | Optional hard kill for the abandoned-checkout email. Overrides the console switch. |
| `NEXT_PUBLIC_APP_URL` | Already used. Now also the base URL shown on `/developers`. |
| `RESEND_API_KEY` | Already used. Delivers the follow-up and test emails. |
| `SUPABASE_SERVICE_ROLE_KEY` | Already used. Required for every `/api/v1` call and for key management. |
| `CRON_SECRET` | Already used. |

## Rollback

- **Code:** in Vercel, promote the previous deployment (`bd69b2b`), or `git revert` the three commits.
- **If zzzw is applied and the old code is live:**
  - Old v1 keys still authenticate. Revoked or expired keys are refused, which is the intended direction.
  - Old code cannot create keys, because browser writes are revoked. To restore them temporarily:
    ```sql
    grant insert, update, delete on api_keys to authenticated;
    ```
    The RLS policies still require admin.
- **zzzw and zzzx are additive.** They add columns, tables and functions, and drop nothing. Leaving them in place under old code is safe. To undo the follow-up feature only:
  ```sql
  update platform_switches set checkout_followup_mode = 'off';
  ```
- **Pricing:** reverting `128a6b1` restores the old prices and allowances. Workspaces that paid in between keep what they paid for; settle records the period.

## What each feature does, and what it does not

| Area | Shipped | Not done / honest limits |
|---|---|---|
| API keys | 256-bit secret, hash only, show once. Scopes, expiry, rotate (24 h / 7 d grace), regenerate, revoke (row kept). Per-key plan rate limit, last-used, usage per key/endpoint/day, audit trail without secrets. Browser cannot write `api_keys`. | No per-key custom rate limit or IP allow-list. |
| API v1 | `whoami`, `invoices`, `customers`, `sales-orders`, `leads`, `metrics`, `ingest`, `openapi.json`. Keyset paging, validated filters, unknown params refused, consistent errors, `X-Request-Id`. | Read-only for resources; writes only via `ingest`. Cursor quoting has not been verified live (see step 5). |
| Webhooks | Already signed (HMAC-SHA256 over `timestamp.body`), retried up to 5 times. Now documented in OpenAPI. | No replay-window guidance beyond "reject stale timestamps". |
| Analytics | Fixed event vocabulary. Payments, activations and renewals come only from verified Cashfree events. GPC/DNT honoured. No cookies or PII. 90-day retention (existing prune). Dashboard on `/superadmin`. | `healthcheck_start` and `calculator_view` exist but are not yet wired. API usage is counted in `api_usage_daily`, not the funnel. |
| Checkout follow-up | Email only. Only for Cashfree-confirmed unpaid orders, 24 h–7 d old. Excludes paid, subscribed, opted-out and unconfirmed owners. 14-day cap, one per workspace per run. Claim before send. Retry ≤ 3; an uncertain send is never retried. Masked addresses. Dry-run, test send, live switch. | WhatsApp not sent: it needs an approved template and opt-in. Never tested against live Resend from this sandbox. |
| Premium tiers | New prices. `api_write` (Practice+), `autonomy` (Command+) and the 15-reminder watch, each enforced server-side before the write. | Gates creation only: existing keys and rules keep working after a downgrade, by design. |
| Browser automation | Not needed: Cortex integrates through server APIs and webhooks. | — |

## Verification run before commit

- 121 test suites pass, including new `test:api-v1` (86), `test:checkout-followup` (74), `test:premium-tiers` (47) and `test:api-ingest` (+11, the whole zzzw migration on real Postgres via PGlite).
- 24 new guards mutation-checked. All were KILLED.
- `tsc` clean on every changed file.
- Diff scanned for secrets: none.
- **Not run here:** a full `next build`, live production calls, and real email delivery.
