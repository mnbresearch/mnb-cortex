# MNB Cortex — setup guide

Every capability in Cortex is **built**. Some wait on a credential only you can
supply. Nothing below needs a code change: add the variable in Vercel, redeploy,
and the feature switches on.

**Check what's live at any time:** sign in as a super-admin and open
**Setup status** in the sidebar (`/setup`). It lists every capability, whether
it's on, and the exact variable that's missing.

Set variables in **Vercel → your project → Settings → Environment Variables**,
scope them to *Production* (and *Preview* if you use it), then redeploy.

---

## Live with no extra work

| Capability | Variable | Notes |
|---|---|---|
| Database, workspaces, KPIs | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` |
| AI text — chat, Deep Dive, reports, agents | `GEMINI_API_KEY` | Free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), no card |
| Image agents (80) | `GEMINI_API_KEY` | Same key. Nothing extra |
| Video agents (14, Google Veo) | `GEMINI_API_KEY` | Same key |
| Email | `RESEND_API_KEY` | [resend.com/api-keys](https://resend.com/api-keys) + verify your domain |
| Payments | `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` | Cashfree → Developers → API Keys |
| Scheduled jobs | `CRON_SECRET` | Any long random string |
| Integration vault | `ENCRYPTION_KEY` | `openssl rand -base64 32` |

Optional overrides: `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`, `VEO_MODEL`,
`AI_PROVIDER`, `CASHFREE_ENV` (`sandbox` to test — **anything else means real
money**), `WEEKLY_UPDATE_ENABLED=1`, `WEEKLY_PLAN_ENABLED=1`.

---

## WhatsApp — needs a Meta account

Cortex has the full Meta Cloud API send path. It cannot work until you own a
WhatsApp Business sender, because Meta requires a verified business and
individually approved templates. That's their rule, not a gap in the code.

**1. Create the app**
[developers.facebook.com](https://developers.facebook.com) → *My Apps* →
*Create App* → **Business** → add the **WhatsApp** product.

**2. Get the two values**
In *WhatsApp → API Setup*:
- **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
- **Access token** → `WHATSAPP_TOKEN`

The test token expires in 24 hours. For production, create a System User in
Meta Business Settings and generate a **permanent** token with the
`whatsapp_business_messaging` permission.

**3. Approve a template**
WhatsApp only allows free-form text inside a 24-hour window that the *customer*
opens by messaging you. Anyone you are chasing for money has not done that, so
payment reminders **must** use a template approved in advance, in
*WhatsApp Manager → Message Templates*. Approval usually takes under an hour.

Create it with category **Utility**, not Marketing. A reminder about an invoice
that already exists is a utility message: it is cheaper per send, and Marketing
templates are rejected far more often and can be blocked by a recipient's
marketing opt-out.

Cortex fills exactly **four** variables, in this order — customer name, your
business name, invoice number, amount. Your template must have four, in that
order, or the send fails. Suggested body, named `payment_reminder`:

> Hello {{1}}, this is a payment reminder from {{2}}. Invoice {{3}} for {{4}} is now past its due date. If you have already paid, please ignore this message or reply with the payment reference.

Then put the template's **exact** name into *Collections → Settings →
Your approved WhatsApp template name*, along with its language code. Meta
treats `en` and `en_US` as different templates, so copy whichever appears next
to yours in WhatsApp Manager.

**4. Add both variables in Vercel and redeploy.**
`/setup` will show WhatsApp as **live**, and AI Outreach can send for real.

### Collections is stricter, on purpose

Payment reminders will **only** go out over WhatsApp using *your own* Meta
account — the platform credentials above are never used for them, even when
they are configured. Two reasons:

- Your customer would receive a demand for money from *MNB Research*, a company
  they have never dealt with, and their reply ("already paid, UTR 4471") would
  arrive with us instead of you.
- WhatsApp rates senders on how often recipients block or report them. One
  shared number carrying every business's dunning is a number that gets rated
  badly and then throttled — which would break everyone's messages at once.

So: connect your own Meta account on **Integrations**, name your approved
template in **Collections → Settings**, and until you do, WhatsApp reminders are
skipped with the reason shown on each one. Your email reminders keep working
throughout — a WhatsApp setup gap never switches collections off.

Sending from code:

```ts
import { sendTemplate, sendText } from "@/lib/whatsapp";

await sendTemplate("9876543210", "payment_reminder", [name, invoiceNo, amount]);
await sendText("9876543210", "Thanks — received!");   // only inside the 24h window
```

Cost: Meta charges per conversation. Cortex caps sending at 100/day per
workspace so a runaway loop can't run up a bill.

---

## Tally — needs a script on the Tally machine

Tally Prime serves its XML gateway on `localhost:9000`, on the PC it runs on.
Cortex runs on Vercel, on the public internet, and **cannot reach your LAN**.
No API key fixes that — the connection has to start from your side.

**1. In Tally:** F1 → *Settings* → *Connectivity* → *Client/Server configuration*
→ set **Tally.ERP 9 is acting as: Both**, port `9000`. Confirm
`http://localhost:9000` responds in a browser on that machine.

**2. In Cortex:** *Developers · API* → **Generate key** → copy it.

**3. On the Tally machine** (needs Node 18+):

```bash
node scripts/tally-bridge.mjs --key=ck_your_key_here
```

Keep it running and syncing every 30 minutes:

```bash
node scripts/tally-bridge.mjs --key=ck_your_key_here --watch --every=30
```

Options: `--tally=http://localhost:9000`, `--cortex=https://cortex.mnbresearch.com`.

The bridge reads the Voucher Register, converts sales and purchase vouchers into
sales orders and invoices, and pushes them through `/api/v1/ingest`. Your KPIs
recompute automatically on arrival.

---

## SSO / SAML — needs Supabase Pro

SAML is a paid Supabase feature configured on the Supabase project, not in this
codebase. It requires the **Pro plan ($25/mo)**, after which you register the
identity provider with the Supabase CLI. Until then, sell Enterprise SSO as
*on request*.

---

## Outbound webhooks — no setup, just add a URL

*Developers · API → Outbound webhooks → Add endpoint.*

Cortex POSTs signed JSON when something happens. Events:
`metrics.recomputed`, `alert.created`, `workflow.completed`, `invoice.overdue`,
`payment.succeeded`, `subscription.expired`, `report.generated`.

Verify every request — this is the same scheme Cortex uses to verify Cashfree:

```js
import crypto from "crypto";

app.post("/hooks/cortex", express.raw({ type: "*/*" }), (req, res) => {
  const ts   = req.header("X-Cortex-Timestamp");
  const sig  = req.header("X-Cortex-Signature");
  const body = req.body.toString("utf8");

  const expected = crypto.createHmac("sha256", process.env.CORTEX_WEBHOOK_SECRET)
    .update(`${ts}.${body}`).digest("base64");

  if (sig !== expected) return res.status(401).end();
  res.status(200).end();               // 2xx = delivered; anything else is retried
});
```

Failed deliveries retry up to 5 times, swept by the daily cron. Delivery history
is on the same page.

---

## Scheduled reports — no setup

*Reports → Schedule a report.* Pick a mode (`brief`, `report`, `actions`,
`risk`, `costs`, `forecast`, `investor`, `benchmark`), a cadence and a
recipient. Sent by the daily cron.

A report only sends when the workspace has real KPIs — Cortex will never email
an invented summary of an empty workspace.

---

## Workflows — no setup

*Workflows → New workflow.* Each step starts with an action word:

| Step | Does |
|---|---|
| `recompute` | Refresh the dashboard KPIs |
| `receivables` | Total overdue invoices, name the worst |
| `reorder` | Find stock below its reorder level |
| `alert <message>` | Raise an in-app alert |
| `email <subject>` | Email the owner what this run found |
| `ai <mode> <prompt>` | Run an AI mode over the findings and save it |
| `note <text>` | Record a note in the run log |

Example — `recompute, receivables, ai actions, email Your daily digest`.
Steps share findings, so `email` sends the real numbers the earlier steps found.
An unrecognised step is reported as **skipped**, never as success.

---

## Auto-renewal (Cashfree mandates)

Without a mandate every plan is a one-off order: the workspace locks at the end
of the period unless the customer pays again. A mandate is authorised **once**
and each cycle is debited automatically.

Uses the same `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY`. **Ask Cashfree to
enable Subscriptions on your account** — it isn't on by default.

Customers turn it on under *Billing → Auto-renewal*. Cashfree charges ₹1 to
verify the mandate and refunds it.

**The one limit to know:** UPI Autopay is capped at **₹15,000 per mandate**.

| Plan | Monthly | UPI Autopay? |
|---|---|---|
| Solo | ₹799 | yes |
| Starter | ₹2,499 | yes |
| Growth | ₹6,999 | yes |
| Premium | ₹17,999 | no — card or eNACH |
| Business | ₹39,999 | no — card or eNACH |

The UI says this before the customer starts, rather than letting them discover
it at their bank's screen. Successful cycles arrive as `SUBSCRIPTION_*`
webhooks and extend the paid period; a cancelled or on-hold mandate leaves the
already-paid period intact and simply stops future renewals. Renewal reminder
emails skip workspaces with a live mandate.

---

## Integration data sync

Most of the 62-provider catalogue is a **secure credential vault** — it stores
and (for 16 providers) verifies keys. Four providers actually pull data into
Cortex today:

| Provider | What comes in | Credentials |
|---|---|---|
| **Shopify** | Orders → sales orders, customers | Shop domain + Admin API access token |
| **Razorpay** | Captured payments → paid receivables | Key id + key secret |
| **Stripe** | Paid charges → paid receivables | Secret key |
| **Google Sheets** | Any sheet with amount + customer columns → sales orders | Published sheet URL |

Connect one under *Integrations*, then press **Sync data now**. The nightly cron
also syncs every connected provider automatically, before the KPI recompute, so
the dashboard is current each morning.

Re-syncing is safe: each record carries a deterministic external id
(`SHOP-1234`, `RZP-pay_xxx`) written to its natural key, and Cortex upserts on
it. The same order imported twice updates one row rather than creating two.

Adding another connector is one function in `src/lib/sync/index.ts` — map the
provider's response onto `sales_orders` / `invoices` / `customers` and add it to
`CONNECTORS`.

---

## Local development

`vercel env pull` writes the literal string `[SENSITIVE]` for every variable
marked sensitive, so a pulled `.env.local` looks full while the secrets are
placeholders. Fill them in with:

```bash
bash scripts/set-secrets.sh
```

It prompts for each one, hides input, backs up the file and skips anything
already set. Production is unaffected — Vercel has the real values.

---

## Database migrations

Run in this order in the Supabase SQL editor. All are idempotent.

1. `2026_hardening.sql` — RLS on billing tables, locked-down RPCs, subscription periods
2. `2026_metrics_layer.sql` — merge key + GST columns for the KPI layer
3. `2026_tenancy.sql` — role-split RLS across every tenant table
4. `2026_signup_trigger.sql` — profile-only signup trigger
5. `2026_renewal_notices.sql` — renewal reminders + `billing_phone`
6. `2026_integrations_layer.sql` — webhooks + scheduled reports
