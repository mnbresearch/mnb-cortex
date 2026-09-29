-- Make the quotes unique index usable by ON CONFLICT.
--
-- ============================================================================
-- THE DEFECT
-- ============================================================================
--
-- Pressing "Save to workspace" on /quote failed, in production, for every
-- customer, with a raw Postgres string shown on screen:
--
--     there is no unique or exclusion constraint matching the ON CONFLICT
--     specification
--
-- lib/actions.ts saveQuote() upserts with `onConflict: "org_id,quote_no"`.
-- 2026_invoice_documents.sql created the matching index as PARTIAL:
--
--     create unique index quotes_org_quoteno_key
--       on quotes (org_id, quote_no) where quote_no is not null;
--
-- Postgres will only use a partial index to resolve ON CONFLICT when the
-- statement itself carries a predicate that provably implies the index's
-- predicate. PostgREST's upsert emits no such predicate, so the planner finds
-- no usable arbiter and raises. The migration and the query were written
-- against different assumptions and nothing compared them.
--
-- The consequence is that the quotes table has always been empty: the feature
-- has never once saved a row. Which in turn is why /quote's saved-quote list,
-- its Won/Lost controls and its convert-to-invoice button were never reachable
-- — there was nothing for them to act on.
--
-- ============================================================================
-- WHY DROPPING THE PREDICATE IS SAFE, NOT A LOOSENING
-- ============================================================================
--
-- The `where quote_no is not null` looks like it is there to let several rows
-- hold a NULL quote_no. It is not needed for that: in a standard Postgres
-- unique index NULLs are DISTINCT from one another, so any number of rows may
-- have a NULL quote_no under a total index too. (That is the default; only
-- `NULLS NOT DISTINCT`, added in PG15 and not used here, would change it.)
--
-- So the predicate bought nothing and cost the entire feature. Removing it
-- leaves the constraint semantics identical for every row that has a quote
-- number, keeps multiple NULLs legal, and makes the index a valid ON CONFLICT
-- arbiter.
--
-- No data can be lost applying this: the partial index already forbade
-- duplicate non-null (org_id, quote_no) pairs, so no existing row can violate
-- the wider index.
--
-- Safe to run more than once.

begin;

drop index if exists quotes_org_quoteno_key;

create unique index if not exists quotes_org_quoteno_key
  on quotes (org_id, quote_no);

commit;

-- Verify: this should return one row, with indexpred NULL (i.e. not partial).
--
--   select indexrelid::regclass as index_name,
--          pg_get_expr(indpred, indrelid) as indexpred
--     from pg_index
--    where indrelid = 'quotes'::regclass and indisunique;
