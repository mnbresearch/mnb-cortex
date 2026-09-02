/*
  Make an invoice a record rather than a printout.

  WHAT WAS WRONG.

  components/invoice-generator.tsx and components/quote-builder.tsx were pure
  React state plus window.print(). Nothing was persisted anywhere — not to the
  database, not even to localStorage. You filled in a customer, line items, GST
  and a total, printed a PDF, and the moment the tab closed the document was
  gone.

  Meanwhile the `invoices` table already exists and is read by, at minimum:
  receivables ageing, DSO, the cash conversion cycle, 13-week cash, the
  collections chase, global search, the workflow engine and the KPI recompute.
  Every one of those sits empty for a customer who bills through Cortex's own
  invoice tool.

  So the product built the one weekly habit an SME owner already has — raising
  a bill — and then threw the result away, leaving eight downstream modules
  looking broken through no fault of their own.

  WHAT THIS ADDS.

  Only two columns. The header fields the table already has (invoice_no, party,
  amount, due_date, status, type) are exactly what the downstream modules read,
  and they are enough for all of them.

    meta        the full document — seller, buyer, line items, tax split — so an
                invoice can be REOPENED and reprinted byte-identically months
                later. Without it, "saved" would mean "we kept the total", and
                the owner would still have to rebuild the invoice by hand to
                produce a duplicate copy for a customer who lost theirs.

    issue_date  the invoice date, which is distinct from due_date and from
                created_at. created_at is when the row was written; an invoice
                raised today for work done last month is dated last month, and
                ageing that is off by weeks is worse than no ageing.

  No new table for line items. That would be the textbook shape, but every
  consumer reads the header only, and a jsonb document is both simpler and
  exactly what "reprint this invoice" needs. If line-item analytics are ever
  wanted, promote meta->items into a real table then, with a real reason.

  A unique index on (org_id, invoice_no) already exists — from
  2026_sync_layer.sql, added for the Stripe/Razorpay importer — so saving is an
  upsert on that natural key and pressing Save twice cannot create two
  receivables for one bill. That mattered enough to check before writing this.
*/

alter table invoices add column if not exists meta       jsonb;
alter table invoices add column if not exists issue_date date;

/*
  Backfill issue_date for rows that predate the column, so ageing does not treat
  every historical invoice as undated. created_at is the honest best guess for a
  row we have nothing better for, and it is what the ageing code already falls
  back to.
*/
update invoices set issue_date = created_at::date
 where issue_date is null and created_at is not null;

create index if not exists invoices_org_issue_idx on invoices (org_id, issue_date desc);

/*
  Quotes are a different document with a different lifecycle — a quote is not a
  receivable and must never be counted as one. Kept in its own table for exactly
  that reason: putting them in `invoices` with a status of 'quote' is how a
  pipeline number ends up inside a cash forecast.
*/
create table if not exists quotes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  quote_no    text,
  party       text,
  amount      numeric,
  valid_until date,
  status      text not null default 'open' check (status in ('open','accepted','declined','expired')),
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create unique index if not exists quotes_org_quoteno_key
  on quotes (org_id, quote_no) where quote_no is not null;
create index if not exists quotes_org_created_idx on quotes (org_id, created_at desc);

alter table quotes enable row level security;

/*
  Membership-scoped, all four verbs — this is the workspace's own commercial
  document, not something the platform grants, so the user writes it directly.
  (Contrast referrals and credits, which are value-granting and therefore
  service-role only.)
*/
drop policy if exists "members read quotes" on quotes;
create policy "members read quotes" on quotes for select
  using (org_id in (select user_org_ids()));

drop policy if exists "members write quotes" on quotes;
create policy "members write quotes" on quotes for insert
  with check (org_id in (select user_org_ids()));

drop policy if exists "members update quotes" on quotes;
create policy "members update quotes" on quotes for update
  using (org_id in (select user_org_ids()))
  with check (org_id in (select user_org_ids()));

drop policy if exists "members delete quotes" on quotes;
create policy "members delete quotes" on quotes for delete
  using (org_id in (select user_org_ids()));

/*
  When an alert was actually sent to the owner.

  `alerts` rows were raised and never delivered — the product promises the owner
  will "get warned the moment a number crosses your line", and what happened was
  that he got warned if he logged in and looked.

  This column is what makes delivery safe to switch on. Without a record of what
  has been sent, the digest would re-send every open alert every single day,
  which turns a useful warning into a filtered sender within a week.

  NULL means "raised but not yet notified", which is also the correct state for
  every alert that already exists — so switching this on emails nobody about
  history. lib/alert-delivery.ts additionally bounds itself to the last two days.
*/
alter table alerts add column if not exists notified_at timestamptz;

create index if not exists alerts_pending_notify_idx
  on alerts (org_id, created_at desc)
  where notified_at is null and is_read = false;
