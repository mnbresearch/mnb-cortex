-- ============================================================================
-- The receivables query had no index it could use, and it is the product's
-- most-opened screen.
-- ============================================================================
--
-- app/(app)/receivables/page.tsx filters
--
--     org_id = ? AND type = 'receivable'
--     AND (status IS NULL OR status NOT ILIKE 'paid')
--   ORDER BY amount DESC
--   LIMIT 5000
--
-- Against the indexes that existed — (org_id, status) and (org_id, issue_date)
-- — Postgres could use org_id and then had to filter and SORT every invoice
-- that workspace has ever raised. `type` was not indexed, `amount` was not
-- indexed, and ILIKE is not indexable at all, so the planner's only option was
-- a scan plus a sort.
--
-- Fine at a few thousand invoices. A distributor with 100k rows pays for all
-- of them on every page load, and this is the screen the whole product is sold
-- on.
--
-- A PARTIAL index is the right shape here rather than a plain composite:
-- the predicate matches the query's own WHERE clause, so the index contains
-- only open receivables — a small fraction of a mature ledger — and `amount
-- desc` inside it means the ORDER BY is satisfied by the index order with no
-- sort step at all.
--
-- `status is distinct from 'paid'` is used rather than the query's ILIKE
-- because an index predicate must be immutable. Rows whose status is 'Paid'
-- or 'PAID' therefore still live in the index and are removed by the query's
-- own ILIKE filter afterwards — the index stays a superset of what the query
-- wants, which is all a partial index has to be to stay correct.
--
-- CONCURRENTLY so this cannot lock the table on a live database. It must
-- therefore run OUTSIDE a transaction block; Supabase's SQL editor runs
-- statements standalone, so pasting this is fine.

create index concurrently if not exists idx_invoices_open_receivables
  on invoices (org_id, amount desc)
  where type = 'receivable' and status is distinct from 'paid';

-- The practice brief and the collections candidate query both age open
-- receivables by due date for one org. Same predicate, different order.
create index concurrently if not exists idx_invoices_open_receivables_due
  on invoices (org_id, due_date)
  where type = 'receivable' and status is distinct from 'paid';

notify pgrst, 'reload schema';
