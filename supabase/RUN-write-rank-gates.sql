/*
  Seven tables let ANY MEMBER write. Making the database agree with the app.

  THE GAP.

  2026_tenancy.sql set a house standard for every tenant table: read to any
  member via user_org_ids(), INSERT/UPDATE at user_org_rank >= 2 (analyst),
  DELETE at >= 3 (manager). Tables added afterwards by
  2026_action_board.sql, 2026_collections.sql, 2026_invoice_documents.sql and
  2026_msme_43bh.sql used `org_id in (select user_org_ids())` for their WRITES
  as well as their reads — which is rank 1, a viewer.

  The application does not agree with any of that. actions.ts routes these
  through requireWriteOrg() (analyst) and, for the collections policy,
  requireRole("admin"). But PostgREST serves these tables directly to anyone
  holding the anon key, and the anon key ships in our own browser bundle, so
  the server action is not in the path. The check exists and is bypassable.

  WHAT A VIEWER COULD DO, CONCRETELY.

  collection_policies is the one that matters. It is a single row per workspace
  holding `enabled`, `auto_send`, `tone`, `max_per_day`, the quiet-hours window,
  `do_not_contact`, and the WhatsApp template. A viewer — a role handed to
  junior staff, and in Practice mode to clients — could:

      PATCH /rest/v1/collection_policies?org_id=eq.<their own workspace>
      { "auto_send": true, "max_per_day": 200,
        "send_from_hour": 0, "send_to_hour": 23,
        "tone": "firm", "do_not_contact": [] }

  and the next autopilot run sends up to 200 firm chasing messages, at any hour
  of the night, to every customer including the ones the owner had explicitly
  excluded — in the business's name, over the business's own email domain and
  WhatsApp sender. That is not a data-integrity bug. It is reputational damage
  to the customer's business, executed through our product, by someone the
  owner deliberately gave read-only access to.

  The rest are ordinary but still wrong: a viewer could delete another user's
  quotes, vendors, action tasks and decisions.

  THE FIX.

  Mirror the app exactly, so there is one answer to "who may do this" instead
  of two. collection_policies goes to admin because saveCollectionPolicy() says
  admin. Everything else takes the house standard.

  Reads are deliberately left at user_org_ids(). Workspace-wide read is the
  intended design and narrowing it here would break the collections page for
  the viewers who are supposed to see it.
*/

do $$
declare
  t text;
  spec record;
begin
  for spec in
    select * from (values
      /* table,                  insert/update rank, delete rank */
      ('action_tasks',           2, 3),
      ('decisions',              2, 3),
      ('quotes',                 2, 3),
      ('vendors',                2, 3),
      ('collection_threads',     2, 3),
      ('collection_messages',    2, 3),
      /* Admin, because saveCollectionPolicy() requires admin. This row decides
         what gets sent to the customer's customers, in their name. */
      ('collection_policies',    4, 4)
    ) as v(tbl, w_rank, d_rank)
  loop
    t := spec.tbl;
    if to_regclass('public.' || t) is null then
      raise notice 'skipping % — table does not exist', t;
      continue;
    end if;

    execute format('alter table %I enable row level security;', t);

    /*
      Drop the any-member write policies by BOTH naming conventions in use.
      The "members ..." names come from the four migrations above; the
      "tenant ..." names from 2026_tenancy.sql. Getting this wrong by name is
      what left a stray policy on `integrations` — see
      2026_integrations_lockdown.sql. The verification below counts rather than
      trusts, so a missed name shows up as a failure instead of silence.
    */
    execute format('drop policy if exists "members write %1$s" on %1$I;', t);
    execute format('drop policy if exists "members update %1$s" on %1$I;', t);
    execute format('drop policy if exists "members delete %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant insert %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant update %1$s" on %1$I;', t);
    execute format('drop policy if exists "tenant delete %1$s" on %1$I;', t);

    execute format($f$create policy "members write %1$s" on %1$I for insert
      with check (user_org_rank(org_id) >= %2$s);$f$, t, spec.w_rank);

    execute format($f$create policy "members update %1$s" on %1$I for update
      using (user_org_rank(org_id) >= %2$s)
      with check (user_org_rank(org_id) >= %2$s);$f$, t, spec.w_rank);

    execute format($f$create policy "members delete %1$s" on %1$I for delete
      using (user_org_rank(org_id) >= %2$s);$f$, t, spec.d_rank);

    /* Read stays workspace-wide, but make sure exactly one read policy exists
       and that it is the intended one — a leftover FOR ALL policy from an
       older migration would re-grant every write we just removed. */
    execute format('drop policy if exists "tenant read %1$s" on %1$I;', t);
    execute format('drop policy if exists "members read %1$s" on %1$I;', t);
    execute format($f$create policy "members read %1$s" on %1$I for select
      using (org_id in (select user_org_ids()));$f$, t);
  end loop;
end $$;


/*
  Sweep any FOR ALL policy left on these tables by an older migration.

  Permissive policies are OR'd, so a single surviving `for all` grant makes
  every rank gate above decorative. This is exactly how the integrations
  lockdown reported success while a stray policy sat underneath it. Dropping by
  shape rather than by name, because names are what we keep getting wrong.
*/
do $$
declare p record;
begin
  for p in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('action_tasks','decisions','quotes','vendors',
                        'collection_threads','collection_messages','collection_policies')
      and cmd = 'ALL'
  loop
    raise notice 'dropping FOR ALL policy "%" on % — it would bypass the rank gates',
      p.policyname, p.tablename;
    execute format('drop policy if exists %I on %I;', p.policyname, p.tablename);
  end loop;
end $$;


/* ---------------------------------------------------------------------------
   VERIFY. Every row must read OK. Paste the output back.

   Compared against the TOTAL, not a hardcoded count — the integrations
   verification printed "4 of 4 OK" while a fifth policy sat beside it,
   because it compared matches to a literal instead of to the total.
   --------------------------------------------------------------------------- */
with expect(tbl, w_rank, d_rank) as (values
  ('action_tasks',2,3), ('decisions',2,3), ('quotes',2,3), ('vendors',2,3),
  ('collection_threads',2,3), ('collection_messages',2,3), ('collection_policies',4,4)
)
select
  e.tbl as table_name,
  case when
        (select count(*) from pg_policies p where p.tablename = e.tbl) = 4
    and (select count(*) from pg_policies p where p.tablename = e.tbl and p.cmd = 'ALL') = 0
    and exists (select 1 from pg_policies p where p.tablename = e.tbl and p.cmd = 'INSERT'
                  and p.with_check like '%>= ' || e.w_rank || '%')
    and exists (select 1 from pg_policies p where p.tablename = e.tbl and p.cmd = 'UPDATE'
                  and p.qual like '%>= ' || e.w_rank || '%')
    and exists (select 1 from pg_policies p where p.tablename = e.tbl and p.cmd = 'DELETE'
                  and p.qual like '%>= ' || e.d_rank || '%')
    and exists (select 1 from pg_policies p where p.tablename = e.tbl and p.cmd = 'SELECT'
                  and p.qual like '%user_org_ids%')
  then 'OK' else 'FAIL' end as result,
  (select count(*) from pg_policies p where p.tablename = e.tbl)::text || ' policies'
    || case when (select count(*) from pg_policies p where p.tablename = e.tbl and p.cmd='ALL') > 0
            then ' — HAS A "FOR ALL" POLICY, WHICH BYPASSES THE GATES' else '' end
    || ', write>=' || e.w_rank || ' delete>=' || e.d_rank as detail
from expect e
order by e.tbl;
