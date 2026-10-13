/*
  Close the four credit RPCs to the browser — every overload — and keep the
  service role's access. Run in production on 2026-10-13 alongside
  2026_zzzq_rpc_grant_probe.sql (which had never been applied, so /api/health
  could not verify this and reported "Schema migrations: degraded").

  Safe: every caller in src/ uses the service client (lib/credits.ts,
  lib/pay/refund.ts, lib/pay/settle.ts, lib/memory.ts). Re-runnable.
  Verified result: anon false, authenticated false, service_role true for all
  four; cortex_rpcs_locked() = true; /api/health operational.
*/
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('charge_credits', 'grant_credits', 'sync_allowance', 'bump_memory_refs')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as browser_can_execute,
       has_function_privilege('service_role', p.oid, 'execute')  as server_can_execute
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('charge_credits', 'grant_credits', 'sync_allowance', 'bump_memory_refs')
 order by 1;
