/* ===========================================================================
   RUN THIS. It is four statements, and one of them unblocks invoice import.

   WHY THIS FILE EXISTS RATHER THAN "re-run 2026_invoice_documents.sql"

   /api/health reported:

       Schema migrations: degraded
       Not applied: 2026_invoice_documents (invoices.meta unreadable)

   That file is HALF applied on production. `quotes` exists with its policies,
   and `alerts.notified_at` exists — both probe clean — but the two columns it
   adds to `invoices` do not. Re-running the whole migration would fail at its
   `create policy "members read quotes"` statements, which are the only
   non-idempotent lines in it, and leave you reading a Postgres error instead
   of a fix.

   So this is just the missing half, and every statement below is safe to run
   twice.

   WHAT IS ACTUALLY BROKEN WITHOUT IT

   `issue_date` is a member of IMPORT_COLS.invoices (src/lib/import-map.ts), so
   the importer maps it on EVERY invoice import. A missing column there is not
   a degraded feature — PostgREST rejects the insert. That is the primary
   onboarding action, the one the product is sold on, failing outright.

   `meta` is less urgent: it holds the line items and notes for a saved
   invoice, so without it the document detail is thinner but nothing errors.

   The backfill matters too. Ageing falls back to created_at when issue_date is
   null, so without the update below every historical invoice is dated from the
   day its row was written rather than the day it was raised — which quietly
   shifts the receivables ageing buckets the 43B(h) engine reads.
   =========================================================================== */

alter table invoices add column if not exists meta       jsonb;
alter table invoices add column if not exists issue_date date;

/*
  created_at is the honest best guess for a row we have nothing better for,
  and it is what the ageing code already falls back to. Scoped to nulls, so
  re-running never overwrites a real invoice date.
*/
update invoices set issue_date = created_at::date
 where issue_date is null and created_at is not null;

create index if not exists invoices_org_issue_idx on invoices (org_id, issue_date desc);


/* ---------------------------------------------------------------- verify ---
   Expect ONE row reading: ok | ok | ok.

   Everything here reads information_schema and pg_indexes rather than the
   columns themselves. That is deliberate: a verify that selects
   `where issue_date is null` cannot run when issue_date is the thing that is
   missing — Postgres resolves column references when it plans the query, so it
   would raise "column does not exist" instead of reporting MISSING. A check
   that errors on the failure it exists to detect is not a check.
   -------------------------------------------------------------------------- */
select
  case when exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='invoices' and column_name='meta')
       then 'ok' else 'MISSING' end as invoices_meta,
  case when exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='invoices' and column_name='issue_date')
       then 'ok' else 'MISSING' end as invoices_issue_date,
  case when exists (select 1 from pg_indexes
                     where schemaname='public' and indexname='invoices_org_issue_idx')
       then 'ok' else 'MISSING' end as ageing_index;

/* How many invoices still have no date. Expect 0 — anything else means the row
   had no created_at either, which is worth knowing about separately. Safe here
   because the column exists by this point in the file. */
select count(*) as invoices_still_undated from invoices where issue_date is null;
