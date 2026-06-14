# MNB Cortex — The AI COO for SMEs

An AI Operating System that helps business owners run their company by **asking**, not by opening spreadsheets. Cortex observes your business data, detects problems, predicts outcomes, recommends actions, and executes workflows — then explains everything in plain language.

> Ask *"How is my business?"* and get a real answer.

Built with **Next.js 14 (App Router) · TypeScript · Tailwind · Framer Motion · Supabase (Postgres + Auth + RLS) · Claude / OpenAI**. Deploys to **Vercel + Supabase**.

---

## What's inside — all 13 modules

| # | Module | What it does |
|---|--------|--------------|
| 1 | **Business Health Dashboard** | 12 live KPIs (revenue, profit, cash, inventory, risk, CSAT...) with green/yellow/red status, AI summary banner, alerts, recommended actions. |
| 2 | **AI CEO Chat** | Natural-language interface. Reads all business data and answers "Why is profit falling?", "What should I buy?", "Should I enter Dubai?". |
| 3 | **Sales Intelligence** | Region/product sales, funnel, conversion, AOV, churn risk + AI actions (quotations, emails, WhatsApp campaigns). |
| 4 | **Finance Intelligence** | P&L, margins, cash runway, receivables ageing, EBITDA + AI actions (invoices, MIS, reminders). |
| 5 | **Production Intelligence** | OEE by machine, downtime, reject rate, yield + maintenance & manpower actions. |
| 6 | **Inventory Intelligence** | Stockout prediction, dead stock, reorder, supplier performance + AI-drafted POs. |
| 7 | **HR Intelligence** | Attrition risk radar, performance, overtime + JD/resume/interview actions. |
| 8 | **Market Intelligence** | AI market scans: size, growth, competitor map, entry barriers, recommendation. |
| 9 | **Strategy Consultant** | McKinsey-style issue trees, SWOT, frameworks, sequenced roadmap with KPIs. |
| 10 | **Document Intelligence** | Upload PDF/Excel/Word/contracts -> summarize, extract, flag risks. |
| 11 | **Meeting Assistant** | Meet/Zoom/Teams transcription -> MOM + auto-assigned action items. |
| 12 | **Workflow Automation** | Scheduled/event workflows that execute (digests, auto-reorder, reminders). |
| 13 | **Admin & Permissions** | Team roles (owner/admin/manager/analyst/viewer) and integrations. |

Dark + light mode, fully responsive (desktop sidebar + mobile bottom nav), animated.

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
   1. `supabase/schema.sql` — all tables for the 13 modules
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
- **AI CEO chat** (`/api/chat`) builds a live business snapshot from your metrics + insights and sends it to Claude/OpenAI with a McKinsey-grade COO system prompt (`src/lib/ai/cortex.ts`). With no key set it returns smart canned answers so the feature still demos.

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
    |  |  |- api/chat/route.ts        # AI COO endpoint
    |  |  |- (app)/                   # authenticated shell + 13 module pages
    |  |- components/   # sidebar, topbar, KPI cards, charts, UI primitives
    |  |- lib/          # supabase clients, data layer, AI layer, demo data
    |  |- types/
    |- .env.example
    |- vercel.json

---

## Extending the "magic" (clean seams already in place)
- **Integrations** (Tally, Zoho, Shopify, Salesforce, WhatsApp, bank/GST) — add connectors that write into existing tables; UI + AI pick them up automatically.
- **RAG / vector search** — enable `pgvector` and embed documents/meetings.
- **Agentic execution** (LangGraph/MCP) — the Workflow module models triggers/steps; back them with Supabase Edge Functions or a worker to actually send emails/POs.
- **Forecasting** — swap heuristic insights for model-driven predictions per module.

---

## License
Private. (c) MNB Cortex.
