/*
  The health check cannot see a migration that only replaces a function.

  ============================================================================
  THE GAP, AND HOW IT ALREADY COST US
  ============================================================================

  checkSchema() in src/lib/health.ts probes a migration by SELECTing a column
  it introduced. That is a good test for a migration that adds a column, and
  it is structurally blind to one that does not:

      create or replace function cortex_msme_exposure(...)

  changes no table, adds no column, and moves nothing a SELECT can reach. So
  /api/health reported "Schema migrations: operational" for two days while the
  43B(h) IST correction sat in the repo, unapplied, and /msme went on
  under-reporting a disallowed deduction.

  The same is now true of 2026_zzzn_renewal_grace_sweep.sql, which replaces
  expire_lapsed_subscriptions(). Until it is run, the nightly cron keeps
  expiring workspaces whose mandate is live — locking out customers who are
  paying correctly and emailing them that their plan has ended. Nothing on the
  status page would say so.

  A migration that has to be run by hand, with nothing checking it was run, is
  exactly the failure mode where "it's fixed" and "it's fixed for customers"
  quietly diverge.

  ============================================================================
  WHAT THIS ADDS
  ============================================================================

  One read-only helper that lets the health check ask whether a function's
  BODY contains an expected marker — which is the only way to tell a replaced
  function from its predecessor without a column to probe.

  It reads pg_proc.prosrc, which is the authoritative text Postgres holds for
  the function. Not a version table we would have to remember to update: the
  thing itself.

  ============================================================================
  WHY IT IS SAFE
  ============================================================================

  · READ-ONLY and `stable`. It cannot write anything.
  · Returns a BOOLEAN, never the source. An attacker who reached it could
    confirm or deny a guess, not extract a definition.
  · `security definer` is required — pg_proc is readable but the helper must
    behave identically whichever role calls it — so `search_path` is pinned to
    `pg_catalog, public`, which is what stops a caller shadowing `pg_proc`
    with their own table.
  · EXECUTE is revoked from public, anon and authenticated. Only the service
    role calls it, from the health endpoint.
  · Scoped to our own `cortex_%` / `expire_%` functions, so it cannot be used
    to probe Supabase's internals or another product's code in this project.

  Idempotent: `create or replace`, same signature.
*/

create or replace function cortex_fn_has(p_name text, p_needle text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = p_name
       /* Our own functions only. Not a general-purpose source oracle. */
       and (p.proname like 'cortex\_%' or p.proname like 'expire\_%')
       and p.prosrc like '%' || p_needle || '%'
  );
$$;

/*
  REVOKE AND GRANT, NOT REVOKE ALONE.

  The first version of this file stopped at the revoke, with a comment saying
  "the health endpoint calls this with the service role" — as though stating
  the caller granted it the privilege. It does not. A new function's only
  EXECUTE privilege is the implicit grant to PUBLIC, and revoking that leaves
  service_role with nothing unless this project's default privileges happen to
  cover it, which is not something to leave to chance on the one check whose
  job is to notice an unapplied migration.

  cortex_has_billing_guard, thirty lines away in 2026_org_billing_guard.sql,
  has always ended `grant execute ... to authenticated, service_role`. This is
  that convention, minus `authenticated`, which has no business reading
  function bodies.
*/
revoke execute on function cortex_fn_has(text, text) from public, anon, authenticated;
grant execute on function cortex_fn_has(text, text) to service_role;

/*
  TELL POSTGREST THE SCHEMA CHANGED.

  Supabase's API layer (PostgREST) keeps its own cache of which functions
  exist. DDL run in the SQL editor does not always invalidate it. Without this
  line a function created above can be present in pg_proc and still return
  PGRST202 "not found in the schema cache" to the app — which /api/health then
  reports as NOT INSTALLED, and an operator who has just run this file is told
  to run it again. That exact loop happened on 4 October.
*/
notify pgrst, 'reload schema';
