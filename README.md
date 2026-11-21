# Cortex — AI agents that work from your books

**Cortex** (by MNB Research) gives an Indian business a team of AI agents —
Finance, Operations, and Sales & Growth — that read the company's own books
(Tally, Zoho Books, Vyapar, Busy, Odoo, Shopify, spreadsheets), do the work,
propose actions for approval, and check every rupee figure they quote.

It is sold as solution lines (`src/lib/solutions.ts`, `/solutions`), with
**Cortex for Finance** as the flagship. See `docs/positioning.md`.

Built with **Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS) · Gemini / Groq / OpenAI / Anthropic**. Deploys to **Vercel + Supabase**.

---

## What's inside

136 module pages, 438 agent definitions and 28 calculators, plus the Agent
Workspace. Rather than list them here — where the list goes stale the moment
someone adds a page — the sources of truth are:

| Question | Where the answer actually lives |
|---|---|
| What modules exist? | `src/lib/nav.ts` (`NAV.filter(n => n.calc)` are the calculators) |
| What template agents exist? | `src/lib/agents/catalog.ts` — `agentCount()` |
| Which agents work from the books (tools, teams, leads)? | `src/lib/agents/teams.ts` |
| What can an agent look up or do? | `src/lib/ai/tools.ts` (chat tools) + `src/lib/agents/tool-specs.ts` / `toolkit.ts` (agent tools) |
| What do the plans include, and the agent limits? | `src/lib/config.ts` — `PLANS[].features`, `PLAN_AGENT_LIMITS` |
| Which integrations really sync? | `src/lib/sync/index.ts` — `CONNECTORS`. Six: Shopify, Razorpay, Stripe, Google Sheets, Zoho Books, Odoo. The rest of the catalogue in `src/lib/integrations.ts` is a credential vault. |
| What is genuinely wired vs aspirational? | `SETUP.md`, which is the honest document |

**The load-bearing parts**: the MSME 43B(h) exposure engine (`src/lib/msme.ts`
+ `cortex_msme_exposure`), the collections engine (`src/lib/collections/`), the
action engine and approvals (`src/lib/engine/`), the metrics layer
(`src/lib/metrics.ts`), credit metering (`src/lib/credits.ts`), the tenancy
model (`supabase/migrations/2026_tenancy.sql`) and the Agent Workspace below.

---

## The Agent Workspace (`/workspace`)

One agent runtime on top of the parts that already existed — no second model
loop, no second approval path.

| Piece | File | What it does |
|---|---|---|
| Agent teams | `src/lib/agents/teams.ts` | 15 tool-using agents in 3 teams, each with a lead |
| Routing & planning | `src/lib/agents/orchestration.ts` | Deterministic routing; validates a lead's plan against the roster; a fallback plan when the model's plan is unusable |
| Agent scope | `src/lib/ai/agent-scope.ts` | Lets an agent step run through `runCortex` with its own tools and workspace, with or without a cookie session |
| Toolkit | `src/lib/agents/toolkit.ts` | Chat tools + agent tools (KPI snapshot, 43B(h), statutory calendar, RFM, memory) — all org-scoped |
| Task runner | `src/lib/agents/tasks.ts` | Tasks and checkpointed steps, leases, per-step credit charging and refunds, credit ceilings, pause/resume/cancel, schedules, the sweeper |
| Veritas v1 | `src/lib/veritas.ts` | Checks every rupee figure in an answer against what the agents read; reports unsupported figures and injected instructions |
| API | `src/app/api/agents/tasks/**`, `src/app/api/agents/schedules`, `src/app/api/cron/agents` | Create, read, tick, control, schedule, sweep |
| UI | `src/components/agent-workspace.tsx`, `src/app/(app)/workspace/**` | Delegate, watch the timeline, approve, schedule |

**Background running.** A task advances while the Workspace is open (the page
ticks it) and, on plans with background running, after the tab is closed: the
sweeper `/api/cron/agents` runs every 5 minutes from
`.github/workflows/agents.yml` (needs the `CRON_SECRET` Actions secret, the same
one `autopilot.yml` uses) and daily from `vercel.json`. Every step is
checkpointed, so a timeout or deploy never loses finished work.

**Database.** Run `supabase/RUN-2026-11-20-agent-workspace.sql` once in the
Supabase SQL editor. Until then the Workspace shows a setup message and
`/api/health` reports the tables as not applied.

Tests: `npm run test:agent-workspace` (shape and rules) and `npm run test:agent-runner` (the real runner, end to end against an in-memory database).

---

## Company Knowledge (`/knowledge`)

The company's own mail, chats, documents and systems, searchable by every
agent, with a citation on every hit (`src/lib/knowledge/`):

| Source | Reads | Plan | File |
|---|---|---|---|
| Microsoft 365 | Outlook mail, Teams chats, OneDrive/SharePoint files — read-only scopes | Command, Enterprise | `workspace-sync.ts`, `oauth.ts` |
| Google Workspace | Gmail, Google Drive — read-only scopes | Command, Enterprise | `workspace-sync.ts`, `oauth.ts` |
| MCP servers | Read-only tools the owner allows, called live by agents | Pro and above | `mcp-client.ts` |
| Documents | PDF, Word, Excel, CSV, text | Pro and above | `files.ts` |

Agents get `search_company_knowledge`, and leads also `list_company_sources`
and `query_connected_system`; every brief requires quoting the citation.
Setup: `SETUP.md` → Company Knowledge. Tests: `npm run test:company-knowledge`.

---

## Domains

`mnbcortex.app` is the brand domain; `cortex.mnbresearch.com` is the current
primary. To make `mnbcortex.app` primary:

1. Supabase → Authentication → URL Configuration: add
   `https://mnbcortex.app/auth/callback` to the redirect allow-list (keep the
   old one) and set the Site URL to `https://mnbcortex.app`.
2. Google OAuth client: add `https://mnbcortex.app` as an authorised origin.
3. Vercel → Domains: remove the redirect on `mnbcortex.app`, and set
   `cortex.mnbresearch.com` to redirect (308) to `mnbcortex.app`.
4. Set `NEXT_PUBLIC_APP_URL=https://mnbcortex.app` and redeploy.
5. Cashfree webhook URL and the GitHub Actions `CORTEX_URL` variable: update
   to the new host (the old one keeps working through the redirect for GETs,
   but webhooks should not depend on a redirect).

---

## Quick start (local)

    npm install
    cp .env.example .env.local      # fill in values (see below)
    npm run dev                     # http://localhost:3000

The app runs **in demo mode out of the box** — every screen is alive with realistic data even before you connect Supabase or an AI key. Visit `/dashboard` directly to explore. As soon as you add credentials, it switches to live data and live AI reasoning automatically.

---

## Deploy — Supabase + Vercel

### 1. Create the Supabase project & database
1. Create a project at supabase.com.
2. Open **SQL Editor** and run these three files **in order**:
   1. `supabase/schema.sql` — the base tables
   2. `supabase/rls.sql` — Row-Level Security (multi-tenant isolation) + auto-create org on signup
   3. `supabase/seed.sql` — demo data + a reusable `seed_demo_data(org_id)` function
3. In **Authentication -> Providers**, enable **Email** (magic link) and optionally **Google**.
   - For Google: add your OAuth client ID/secret; set redirect URL to `https://YOUR-DOMAIN/auth/callback`.
4. From **Project Settings -> API**, copy the `URL`, `anon` key, and `service_role` key.

### 2. Deploy to Vercel
1. Push this folder to a Git repo and **Import** it in vercel.com (framework auto-detected as Next.js).
2. Add the environment variables below in **Project -> Settings -> Environment Variables**.
3. Deploy. Vercel runs `npm install && next build` automatically.
4. In Supabase **Authentication -> URL Configuration**, set the Site URL and add
   `https://YOUR-VERCEL-DOMAIN/auth/callback` to the redirect allow-list.

### 3. Environment variables

    # Supabase
    NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key     # server-only

    # AI — set at least one. AI_PROVIDER picks which is used.
    ANTHROPIC_API_KEY=sk-ant-...
    OPENAI_API_KEY=sk-...
    AI_PROVIDER=anthropic            # "anthropic" | "openai"

    NEXT_PUBLIC_APP_URL=https://YOUR-VERCEL-DOMAIN

That's it — you're live.

---

## How auth & data flow
- **Sign up** -> a Postgres trigger (`handle_new_user`) auto-creates a profile, a demo organization, and an owner membership.
- **Every table is org-scoped** via RLS using `user_org_ids()`, so tenants never see each other's data.
- **Server components** (`src/lib/data.ts`) fetch the signed-in user's org data; if Supabase isn't configured or the org has no rows, they fall back to the bundled demo dataset so the UI is never empty.
- **Ask Cortex** (`/api/chat`) builds a live business snapshot from your metrics + insights and answers with tool calls over the workspace's own rows (`src/lib/ai/cortex.ts`, `src/lib/ai/tools.ts`). With no key set it returns canned answers so the feature still demos.

### Seeding a real org with demo numbers
After a user signs up, run in the Supabase SQL editor (or wire a button):

    select seed_demo_data('<their-org-id>');

---

## Project structure

    mnb-cortex/
    |- supabase/
    |  |- schema.sql      # all tables
    |  |- rls.sql         # row-level security + signup trigger
    |  |- seed.sql        # demo data + seed_demo_data() function
    |- src/
    |  |- app/
    |  |  |- page.tsx                 # landing
    |  |  |- login/                   # magic-link + Google
    |  |  |- auth/callback/route.ts   # OAuth/OTP exchange
    |  |  |- api/chat/route.ts        # Ask Cortex endpoint
    |  |  |- (app)/                   # authenticated shell + 136 module pages
    |  |- components/   # sidebar, topbar, KPI cards, charts, UI primitives
    |  |- lib/          # supabase clients, data layer, AI layer, demo data
    |  |- types/
    |- .env.example
    |- vercel.json

---

## Known gaps

Kept here deliberately, and kept honest — this list is read by people deciding
whether to trust the rest of the repo, so an out-of-date one is worse than none.

- **Sync connectors** — four are live: Shopify, Razorpay, Stripe, Google
  Sheets (`src/lib/sync/index.ts` `CONNECTORS`). The other 59 catalogue entries
  store credentials and sync nothing; the integrations UI now badges them
  `Vault` and says so *before* you connect, rather than after you have handed
  over an OAuth token. File import covers Tally, Vyapar and Busy exports, and
  `scripts/tally-bridge.mjs` pushes from a Tally PC into `/api/v1/ingest`
  (needs the `api` capability — Watch Pro and above).
- **White-label** — the app chrome is branded: `logo_url` and the accent colour
  are read by `(app)/layout.tsx` and the sidebar. **Outbound email is not** —
  `renderBrandedEmail()` takes no org parameter, so all ten call sites send
  Cortex-branded mail. The plan bullets say "in your workspace" for this
  reason. *(This entry used to say logo_url was "read by nothing", which
  stopped being true and is exactly the rot this list is supposed to avoid.)*
- **Enterprise SSO** — no SAML/OIDC. Supabase Google sign-in only. Sell on
  request, per `SETUP.md`.
- **RAG / vector search** — `pgvector` is not enabled; Cortex Memory is
  keyword-recalled (`textSearch` + `ilike`), not embedded. So a question
  phrased differently from the stored memory will not retrieve it.
- **Autopilot coverage at scale** — the nightly sweep analyses
  `ANALYSIS_CAP = 20` workspaces, rotated. Below twenty paying workspaces that
  is genuinely daily; above it, each workspace is analysed every
  `ceil(N/20)` nights. The cron returns `nights_for_full_cycle` and nothing
  currently acts on it.

### Closed since the last revision

- ~~**Practice credit pooling**~~ — built. A firm's allowance is now spendable
  inside client workspaces it has claimed: `src/lib/credit-pool.ts` decides the
  payer, `cortex_practice_claim()` in `2026_zzzd_practice_pool.sql` proves
  owner/admin rank in the firm *and* membership of the client before writing
  the link, and the firm's plan and status are re-checked on every charge.
  Opt-in per client from the Practice console.

---

## License
Private. (c) MNB Cortex.
