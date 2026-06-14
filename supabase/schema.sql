-- ============================================================
-- MNB CORTEX — The AI COO for SMEs
-- Full schema for all modules. Run in Supabase SQL editor.
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- ORGANIZATIONS & MEMBERSHIP ----------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,                       -- manufacturing | trading | distribution | education | retail | d2c
  annual_revenue_cr numeric,           -- in INR crore
  currency text default 'INR',
  logo_url text,
  created_at timestamptz default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create type member_role as enum ('owner','admin','manager','analyst','viewer');

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'owner',
  created_at timestamptz default now(),
  unique (org_id, user_id)
);

-- ---------- MODULE 1: BUSINESS HEALTH ----------
create type health_status as enum ('green','yellow','red');

create table if not exists health_metrics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  metric_key text not null,            -- revenue, profit, cash, inventory, orders, productivity, growth, risk, csat, working_capital
  label text not null,
  value numeric,
  unit text,                           -- INR, %, days, score
  delta_pct numeric,                   -- period-over-period change
  status health_status default 'green',
  trend numeric[] default '{}',        -- sparkline series
  as_of date default current_date,
  created_at timestamptz default now()
);

create table if not exists ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  module text not null,                -- health, sales, finance, etc.
  severity health_status default 'yellow',
  title text not null,
  detail text,
  confidence numeric default 0.8,      -- 0..1
  recommended_actions jsonb default '[]',
  created_at timestamptz default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  severity health_status default 'yellow',
  title text not null,
  body text,
  module text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ---------- MODULE 2: AI CEO CHAT ----------
create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  title text default 'New conversation',
  created_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role text not null,                  -- user | assistant | system
  content text not null,
  meta jsonb default '{}',             -- charts, tables, confidence
  created_at timestamptz default now()
);

-- ---------- MODULE 3: SALES ----------
create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  order_no text,
  customer_name text,
  region text,
  product text,
  amount numeric,
  status text default 'won',           -- won | open | lost
  is_repeat boolean default false,
  order_date date default current_date,
  created_at timestamptz default now()
);

create table if not exists sales_pipeline (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  stage text not null,                 -- lead | qualified | proposal | negotiation | won | lost
  deal_name text,
  customer_name text,
  value numeric,
  probability numeric default 0.3,
  expected_close date,
  created_at timestamptz default now()
);

-- ---------- MODULE 4: FINANCE ----------
create table if not exists finance_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  period date not null,
  revenue numeric default 0,
  cogs numeric default 0,
  opex numeric default 0,
  gross_profit numeric default 0,
  net_profit numeric default 0,
  cash_balance numeric default 0,
  receivables numeric default 0,
  payables numeric default 0,
  ebitda numeric default 0,
  created_at timestamptz default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  invoice_no text,
  party text,
  amount numeric,
  due_date date,
  status text default 'pending',       -- paid | pending | overdue
  type text default 'receivable',      -- receivable | payable
  created_at timestamptz default now()
);

-- ---------- MODULE 5: PRODUCTION ----------
create table if not exists production_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  machine text,
  shift text,
  run_date date default current_date,
  planned_qty numeric,
  actual_qty numeric,
  reject_qty numeric default 0,
  downtime_min numeric default 0,
  oee numeric,                         -- 0..100
  energy_kwh numeric,
  created_at timestamptz default now()
);

-- ---------- MODULE 6: INVENTORY ----------
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  sku text,
  name text,
  category text,                       -- raw | wip | finished
  on_hand numeric default 0,
  reorder_level numeric default 0,
  safety_stock numeric default 0,
  daily_consumption numeric default 0,
  unit_cost numeric default 0,
  movement text default 'fast',        -- fast | slow | dead
  supplier text,
  lead_time_days int default 7,
  created_at timestamptz default now()
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  po_no text,
  supplier text,
  item text,
  qty numeric,
  amount numeric,
  status text default 'draft',         -- draft | sent | received
  created_by_ai boolean default false,
  created_at timestamptz default now()
);

-- ---------- MODULE 7: HR ----------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text,
  department text,
  role text,
  attendance_pct numeric default 95,
  performance numeric default 3.5,     -- 1..5
  attrition_risk numeric default 0.1,  -- 0..1
  overtime_hrs numeric default 0,
  monthly_ctc numeric default 0,
  created_at timestamptz default now()
);

-- ---------- MODULE 8 & 9: MARKET + STRATEGY ----------
create table if not exists market_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text,
  query text,
  market_size text,
  growth_forecast text,
  competitors jsonb default '[]',
  entry_barriers jsonb default '[]',
  recommendation text,
  created_at timestamptz default now()
);

create table if not exists strategy_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  framework text,                      -- issue_tree | swot | porter | bcg | ansoff
  question text,
  content jsonb default '{}',
  created_at timestamptz default now()
);

-- ---------- MODULE 10: DOCUMENTS ----------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text,
  type text,                           -- pdf | excel | word | invoice | contract
  storage_path text,
  summary text,
  extracted jsonb default '{}',
  risk_flags jsonb default '[]',
  created_at timestamptz default now()
);

-- ---------- MODULE 11: MEETINGS ----------
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text,
  platform text,                       -- meet | zoom | teams
  meeting_date timestamptz,
  transcript text,
  summary text,
  action_items jsonb default '[]',
  created_at timestamptz default now()
);

-- ---------- MODULE 12: WORKFLOWS ----------
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text,
  trigger text,                        -- schedule | event | manual
  steps jsonb default '[]',
  is_active boolean default true,
  last_run timestamptz,
  created_at timestamptz default now()
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  status text default 'success',       -- success | failed | running
  log text,
  ran_at timestamptz default now()
);

-- ---------- updated_at helper indexes ----------
create index if not exists idx_health_org on health_metrics(org_id);
create index if not exists idx_insights_org on ai_insights(org_id);
create index if not exists idx_sales_org on sales_orders(org_id);
create index if not exists idx_finance_org on finance_ledger(org_id);
create index if not exists idx_inventory_org on inventory_items(org_id);
