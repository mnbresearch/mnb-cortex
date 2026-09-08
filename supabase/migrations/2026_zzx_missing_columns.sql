/* ===========================================================================
   THREE COLUMNS THE APPLICATION READS OR WRITES AND NO MIGRATION CREATES.

   Found by cross-checking every table.column reference in src/ against the
   migration set rather than by anything failing loudly — which is the point.
   All three sit behind `catch {}` or an unchecked result, so each one degrades
   silently and looks like a product decision from the outside.

   -------------------------------------------------------------------------
   1. health_metrics.updated_at
   -------------------------------------------------------------------------
   lib/practice.ts:203 orders by it to compute a client's `lastActivity`. The
   table has created_at and nothing else. PostgREST rejects the ordering, the
   surrounding try/catch swallows it, and lastActivity is ALWAYS null — so the
   Practice console tells a CA firm "No data yet — import this client's books"
   for every client, including the ones who have imported. A firm evaluating
   whether to put 25 clients on Cortex sees a console reporting that none of
   them are using it.

   created_at would be the wrong fix: metrics are upserted on every recompute,
   so created_at is the day the workspace first computed anything, not the last
   time it did. The column has to exist and has to move.

   -------------------------------------------------------------------------
   2. collection_policies.reply_to
   -------------------------------------------------------------------------
   lib/collections/index.ts:399 reads it to set the Reply-To on a chaser email,
   with `catch { /* column not migrated yet */ }` — a comment written against a
   migration that was never written. Nothing wrote the column either, so this
   was dead in both directions and every reminder went out with no Reply-To.

   That is not cosmetic. A collections email is sent through our relay on the
   customer's behalf; the debtor hits reply, and the reply goes to us rather
   than to the business chasing the money. The whole feature is about getting
   paid, and the response path was pointed at the wrong company. The settings
   form now writes this (see saveCollectionsPolicy in lib/actions.ts).

   -------------------------------------------------------------------------
   3. workflow_runs.summary — NOT added here, deliberately.
   -------------------------------------------------------------------------
   lib/workflow-schedule.ts inserted `summary` into a table whose column is
   `log`, so every SCHEDULED workflow wrote no audit row while reporting
   success; the manual path in actions.ts uses `log` correctly. The right fix
   is one word in the TypeScript, not a duplicate column that would leave two
   places to look for the same thing. Fixed in the code.

   Safe to run, and safe to run twice.
   =========================================================================== */

-- ---------------------------------------------------------------------------
-- 1. health_metrics.updated_at, and something to keep it current.
-- ---------------------------------------------------------------------------

alter table health_metrics add column if not exists updated_at timestamptz default now();

/* Backfill so existing rows sort sensibly rather than clustering at the moment
   this migration ran. created_at is the closest truth we have for history. */
update health_metrics set updated_at = created_at where updated_at is null;

create or replace function cortex_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

/*
  A trigger rather than adding the field to every upsert payload in metrics.ts.
  Metrics are written from the recompute path, the demo seeder, and the
  aggregate fast path; a column maintained by three call sites is a column that
  is wrong from whichever one gets added next.
*/
drop trigger if exists trg_health_metrics_touch on health_metrics;
create trigger trg_health_metrics_touch
  before update on health_metrics
  for each row execute function cortex_touch_updated_at();

create index if not exists idx_health_metrics_org_updated
  on health_metrics(org_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. collection_policies.reply_to
-- ---------------------------------------------------------------------------

alter table collection_policies add column if not exists reply_to text;

/*
  Validated in the application (saveCollectionsPolicy) AND here. An address
  that is not an address becomes a header on mail we send on a customer's
  behalf, and a malformed Reply-To is the kind of thing that damages a sending
  domain's reputation for everyone on it.
*/
do $$
begin
  alter table collection_policies
    add constraint collection_policies_reply_to_shape
    check (reply_to is null or reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
exception when duplicate_object then null;
end $$;

/* ---------------------------------------------------------------- verify ---
   Expect one row per column, both present.
   -------------------------------------------------------------------------- */
select table_name, column_name, data_type
  from information_schema.columns
 where (table_name = 'health_metrics'      and column_name = 'updated_at')
    or (table_name = 'collection_policies' and column_name = 'reply_to')
 order by table_name;
