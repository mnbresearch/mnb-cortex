# MNB Cortex — early warning for Indian SMEs

Cortex watches an Indian SME's receivables, payables, cash and statutory clocks, and tells the owner what is about to cost them money — before it does. It sits on top of Tally, Vyapar or Busy rather than replacing them: you upload the export, Cortex reads it.

> The positioning is **early warning**, not "AI COO". See `src/lib/config.ts` for the plans and `scripts/test-positioning.mjs`, which fails the build if marketing copy drifts back.


Built with **Next.js 16 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS) · Google Gemini**. Deploys to **Vercel + Supabase**.

---

## What's inside

130 module pages, 438 agent definitions and 28 calculators. Rather than list them
here — where the list goes stale the moment someone adds a page — the sources of
truth are:

| Question | Where the answer actually lives |
|---|---|
| What modules exist? | `src/lib/nav.ts` (127 nav entries; `NAV.filter(n => n.calc)` are the calculators) |
| What agents exist? | `src/lib/agents/catalog.ts` — `agentCount()` |
| What do the plans include? | `src/lib/config.ts` — `PLANS[].features`, pinned by `scripts/test-positioning.mjs` and `scripts/test-legal.mjs` |
| Which integrations really sync? | `src/lib/sync/index.ts` — `CONNECTORS`. Four: Shopify, Razorpay, Stripe, Google Sheets. The 62-entry catalogue in `src/lib/integrations.ts` is a credential vault, not 62 syncs. |
| What is genuinely wired vs aspirational? | `SETUP.md`, which is the honest document |

**The load-bearing parts**, the ones worth understanding first: the MSME 43B(h)
exposure engine (`src/lib/msme.ts` + `cortex_msme_exposure`), the collections
engine (`src/lib/collections/`), the metrics aggregation layer
(`src/lib/metrics.ts`), credit metering (`src/lib/credits.ts`) and the tenancy
model (`supabase/migrations/2026_tenancy.sql`).

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

## Known gaps

Kept here deliberately, and kept honest — this list is read by people deciding
whether to trust the rest of the repo, so an out-of-date one is worse than none.

- **Sync connectors** — four are live. Tally, Zoho and the other 58 catalogue
  entries store credentials and sync nothing. File import covers Tally, Vyapar
  and Busy exports, which is what the Watch plan actually promises.
- **White-label** — `organizations.logo_url` is captured and read by nothing;
  `renderBrandedEmail()` takes no org parameter. Per-org accent colour works.
- **Enterprise SSO** — no SAML/OIDC. Supabase Google sign-in only. Sell on
  request, per `SETUP.md`.
- **Practice credit pooling** — credits are per workspace; there is no
  cross-org aggregation.
- **RAG / vector search** — `pgvector` is not enabled; Cortex Memory is
  keyword-recalled, not embedded.

---

## License
Private. (c) MNB Cortex.
