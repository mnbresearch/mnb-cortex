/*
  2026_zzzz_p_rank_gates_hardening.sql — Enforce write rank gates on:
  - visibility_runs
  - close_checklists
  - fpa_models

  THE GAP:
  These three tables were created with `org_id in (select user_org_ids())` for their
  INSERT, UPDATE, and DELETE policies. This allowed role 'viewer' (rank 1) to write,
  update, and delete audit, month-end close checklists, and FP&A forecasts.

  THE FIX:
  Enforce Cortex house standard:
  - Read: Workspace members via `user_org_ids()`
  - Insert / Update: Rank >= 2 (Analyst, Manager, Admin, Owner)
  - Delete: Rank >= 3 (Manager, Admin, Owner)
*/

do $$
declare
  t text;
  spec record;
begin
  for spec in
    select * from (values
      ('visibility_runs',  2, 3),
      ('close_checklists', 2, 3),
      ('fpa_models',       2, 3)
    ) as v(tbl, w_rank, d_rank)
  loop
    t := spec.tbl;
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table %I enable row level security;', t);

    -- Drop legacy write/update/delete policies
    execute format('drop policy if exists "members write %1$s" on %1$I;', t);
    execute format('drop policy if exists "members update %1$s" on %1$I;', t);
    execute format('drop policy if exists "members delete %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant insert %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant update %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant delete %1$s" on %1$I;', t);

    -- Create rank-gated policies
    execute format($f$create policy "members write %1$s" on %1$I for insert
      with check (user_org_rank(org_id) >= %2$s);$f$, t, spec.w_rank);

    execute format($f$create policy "members update %1$s" on %1$I for update
      using (user_org_rank(org_id) >= %2$s)
      with check (user_org_rank(org_id) >= %2$s);$f$, t, spec.w_rank);

    execute format($f$create policy "members delete %1$s" on %1$I for delete
      using (user_org_rank(org_id) >= %2$s);$f$, t, spec.d_rank);

    -- Ensure workspace-wide read policy
    execute format('drop policy if exists "tenant read %1$s" on %1$I;', t);
    execute format('drop policy if exists "members read %1$s" on %1$I;', t);
    execute format($f$create policy "members read %1$s" on %1$I for select
      using (org_id in (select user_org_ids()));$f$, t);
  end loop;
end $$;

-- Drop any stray FOR ALL policies that would bypass the rank gates
do $$
declare p record;
begin
  for p in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('visibility_runs', 'close_checklists', 'fpa_models')
      and cmd = 'ALL'
  loop
    execute format('drop policy if exists %I on %I;', p.policyname, p.tablename);
  end loop;
end $$;
