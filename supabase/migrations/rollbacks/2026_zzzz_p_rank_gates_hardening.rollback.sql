/*
  Rollback for 2026_zzzz_p_rank_gates_hardening.sql
  Reverts visibility_runs, close_checklists, fpa_models policies to org_id in (select user_org_ids()).
*/

do $$
declare
  t text;
begin
  for t in select unnest(array['visibility_runs', 'close_checklists', 'fpa_models'])
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('drop policy if exists "members write %1$s" on %1$I;', t);
    execute format('drop policy if exists "members update %1$s" on %1$I;', t);
    execute format('drop policy if exists "members delete %1$s" on %1$I;', t);
    execute format('drop policy if exists "members read %1$s" on %1$I;', t);

    execute format($f$create policy "members read %1$s" on %1$I for select using (org_id in (select user_org_ids()));$f$, t);
    execute format($f$create policy "members write %1$s" on %1$I for insert with check (org_id in (select user_org_ids()));$f$, t);
    execute format($f$create policy "members update %1$s" on %1$I for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));$f$, t);
    execute format($f$create policy "members delete %1$s" on %1$I for delete using (org_id in (select user_org_ids()));$f$, t);
  end loop;
end $$;
