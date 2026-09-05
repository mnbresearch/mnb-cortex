/*
  CRITICAL — unauthenticated cross-tenant write. Run this before anything else.

  THE HOLE.

  `seed_demo_data(p_org uuid)` is SECURITY DEFINER, takes the target workspace
  as a PARAMETER, and never checks that the caller belongs to it. Postgres
  grants EXECUTE on a new function to PUBLIC, and both `anon` and
  `authenticated` are members of PUBLIC — so PostgREST exposed it at
  /rest/v1/rpc/seed_demo_data to anyone holding the anon key, which ships in
  the browser bundle of every page we serve.

      POST /rest/v1/rpc/seed_demo_data
      apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
      {"p_org": "<any org uuid>"}

  No account. No membership. The function then runs fifteen DELETEs and fifteen
  INSERTs against that workspace's health_metrics, finance_ledger, invoices,
  sales_orders, purchase_orders, employees and alerts. health_metrics IS the
  dashboard, so an attacker chooses what a stranger's business appears to be
  worth. This is a financial system of record.

  Reproduced in Postgres before writing this: as role `anon`, with no
  membership row of any kind, a victim's revenue metric went from ₹42,50,000 to
  a value chosen by the caller.

  `seed_demo_customers` has the identical shape. It was revoked from `public`
  but re-granted to `authenticated`, so there the bar is merely "have signed
  up" — thirty seconds and a throwaway address.

  WHY IT WAS MISSED.

  2026_hardening.sql locked down the money-moving RPCs and explicitly exempted
  four functions on the grounds that they "ARE called with the anon/user client
  and do their own key/RLS checks". True of api_ingest (checks an API key) and
  public_report (checks a share token). NOT true of seed_demo_data, which
  checks nothing. The same reasoning error was caught and fixed for
  cortex_aggregate in 2026_tenancy_aggregate.sql; this one was left behind.

  SECURITY DEFINER is precisely why RLS does not save us here: definer rights
  bypass the row policies that would otherwise scope these tables.

  THE FIX, AND WHY IT IS SHAPED THIS WAY.

  The app calls both functions with the SIGNED-IN USER'S own client
  (src/lib/actions.ts:50 and :70), not the service role. So revoking to
  service-role-only would break sample data for every customer. `authenticated`
  has to keep EXECUTE, which means the grant cannot be the control — the
  membership check inside the function has to be.

  Rather than restate thirty DELETE/INSERT statements here and risk them
  drifting from supabase/seed.sql, the existing function is RENAMED to
  `seed_demo_rows` (body preserved byte for byte) and a thin guarded wrapper
  takes its place. The inner function is service-role only, so the guard cannot
  be stepped around by calling it directly.

  `>= 2` is the write rank the tenant RLS policies already use: a `viewer` must
  not be able to overwrite a workspace's numbers either.
*/

-- ---------------------------------------------------------------------------
-- 1. seed_demo_data
-- ---------------------------------------------------------------------------

do $$
declare
  src text;
begin
  select p.prosrc into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seed_demo_data'
     and pg_get_function_identity_arguments(p.oid) = 'p_org uuid';

  if src is null then
    raise notice 'seed_demo_data(uuid) not present — nothing to lock down';
    return;
  end if;

  /*
    IDEMPOTENCY. If the guard is already in place this migration has run, and
    renaming again would move the WRAPPER out of the way and leave the hole
    open — the migration would break the thing it exists to fix on its second
    run. Detect and stop.
  */
  if position('user_org_rank' in src) > 0 then
    raise notice 'seed_demo_data already guarded — skipping';
    return;
  end if;

  execute 'alter function public.seed_demo_data(uuid) rename to seed_demo_rows';
  execute 'revoke all on function public.seed_demo_rows(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.seed_demo_rows(uuid) to service_role';

  execute $fn$
    create function public.seed_demo_data(p_org uuid)
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
      /*
        THE CHECK THAT WAS MISSING.

        user_org_rank() reads auth.uid(), which PostgREST sets from the
        caller's JWT. Role `anon` has no JWT and no membership, so this raises
        and the attack stops here. It runs FIRST, before any DELETE, so a
        rejected call cannot destroy anything on its way out.
      */
      if p_org is null or coalesce(user_org_rank(p_org), 0) < 2 then
        raise exception 'seed_demo_data: not a member of workspace %', p_org
          using errcode = '42501';
      end if;
      perform public.seed_demo_rows(p_org);
    end
    $body$;
  $fn$;

  execute 'revoke all on function public.seed_demo_data(uuid) from public, anon';
  execute 'grant execute on function public.seed_demo_data(uuid) to authenticated, service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 2. seed_demo_customers — same shape, same fix
-- ---------------------------------------------------------------------------

do $$
declare
  src text;
begin
  select p.prosrc into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seed_demo_customers'
     and pg_get_function_identity_arguments(p.oid) = 'p_org uuid';

  if src is null then
    raise notice 'seed_demo_customers(uuid) not present — nothing to lock down';
    return;
  end if;
  if position('user_org_rank' in src) > 0 then
    raise notice 'seed_demo_customers already guarded — skipping';
    return;
  end if;

  execute 'alter function public.seed_demo_customers(uuid) rename to seed_demo_customer_rows';
  execute 'revoke all on function public.seed_demo_customer_rows(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.seed_demo_customer_rows(uuid) to service_role';

  execute $fn$
    create function public.seed_demo_customers(p_org uuid)
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
      if p_org is null or coalesce(user_org_rank(p_org), 0) < 2 then
        raise exception 'seed_demo_customers: not a member of workspace %', p_org
          using errcode = '42501';
      end if;
      perform public.seed_demo_customer_rows(p_org);
    end
    $body$;
  $fn$;

  execute 'revoke all on function public.seed_demo_customers(uuid) from public, anon';
  execute 'grant execute on function public.seed_demo_customers(uuid) to authenticated, service_role';
end $$;

/*
  ---------------------------------------------------------------------------
  3. A standing report, so this CLASS of bug is visible rather than waiting for
     the next auditor.

  Every SECURITY DEFINER function taking an org id as its first argument is by
  construction a potential cross-tenant hole: definer rights bypass RLS, so the
  only thing between a caller and someone else's data is a check the author
  remembered to write. This lists the ones reachable by anon or authenticated.

  Deliberately a report and not an assertion. Several are legitimate —
  api_ingest authenticates with an API key, public_report with a share token —
  and a migration that refused to apply because of them would simply be
  deleted by whoever hit it.
*/
create or replace function public.cortex_definer_audit()
returns table (function_name text, granted_to text, has_membership_check boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select p.proname::text,
         string_agg(distinct r.rolname, ', ' order by r.rolname)::text,
         (position('user_org_rank' in p.prosrc) > 0
          or position('user_org_ids' in p.prosrc) > 0)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated')) as r(rolname)
    join pg_roles a on a.rolname = r.rolname
   where n.nspname = 'public'
     and p.prosecdef
     and p.pronargs > 0
     and (p.proargtypes::oid[])[0] = 'uuid'::regtype
     and has_function_privilege(a.oid, p.oid, 'execute')
   group by p.proname, p.prosrc
   order by 3, 1
$$;

revoke all on function public.cortex_definer_audit() from public, anon, authenticated;
grant execute on function public.cortex_definer_audit() to service_role;
