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

**3. Approve templates**
WhatsApp only allows free-form text inside a 24-hour window that the *customer*
opens by messaging you. To start a conversation you must use a template
approved in *WhatsApp Manager → Message Templates*. Approval takes minutes to a
day. Suggested first template, named `payment_reminder`:

> Hi {{1}}, this is a reminder that invoice {{2}} for {{3}} is now overdue. Please let us know if you need any help.

**4. Add both variables in Vercel and redeploy.**
`/setup` will show WhatsApp as **live**, and AI Outreach can send for real.

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
