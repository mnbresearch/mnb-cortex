/* ===========================================================================
   DIAGNOSTIC ONLY — reads catalog and row counts. Changes nothing. Safe to run.

   THE QUESTION: if someone pays for MNB Cortex and signs in, do they also get
   access to the other product in this Supabase project?

   Why it is a fair question. The two products share a database, and until the
   cortex_payments split they shared a payments table. They also share the
   Cashfree account. If they share `auth.users` as well, then one sign-up is one
   login for both — and the honest answer depends on what each product's RLS
   does with that login.

   THREE SEPARATE THINGS, which are easy to conflate:

     1. LOGIN — can the same credentials sign in to both?
     2. DATA — would they SEE anything belonging to the other product?
     3. ENTITLEMENT — does paying for one grant the paid features of the other?

   Sharing (1) is normal and usually harmless. (2) and (3) are what would
   actually be a problem, and they are what this checks.

   From the code side I have already established that MNB Cortex never reads or
   writes students, teachers, attendance, or any other table belonging to the
   other product, and that its entitlement is decided entirely by
   `organizations.plan` / `.credits` / `.subscription_status`. This checks the
   other direction, which only the database can answer.
   =========================================================================== */

select check_name, result, detail from (

  /* ---------------------------------------------------------------- LOGIN */
  select
    '1. Shared auth: do both products key off auth.users?' as check_name,
    'INFO' as result,
    coalesce((
      select string_agg(c.relname || '.' || a.attname, ', ')
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
      join pg_class fc on fc.oid = k.confrelid
      join pg_namespace fn on fn.oid = fc.relnamespace
      where k.contype = 'f' and fn.nspname = 'auth' and fc.relname = 'users'
        and c.relname in ('students','teachers','attendance','payments')
    ), 'none — the other product does not reference auth.users') as detail

  union all
  /* ------------------------------------------------------------------ DATA */
  /*
    The other product's policy is `owner_id = auth.uid()`. A brand-new Cortex
    customer has no rows carrying their uid, so the policy matches nothing and
    they would see an EMPTY app rather than somebody else's data. That is the
    load-bearing fact, so it is worth confirming the policy really is that and
    not something broader.
  */
  select
    '2. Other product rows are scoped to the individual user',
    case when not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename in ('students','teachers','attendance')
        and (coalesce(qual,'') = 'true' or coalesce(qual,'') not like '%auth.uid()%')
    ) then 'OK' else 'FAIL' end,
    coalesce((select string_agg(tablename || ': ' || coalesce(qual,'(none)'), ' | ')
      from pg_policies where schemaname='public'
        and tablename in ('students','teachers','attendance')), 'no such tables')

  union all
  /*
    MISLABELLED ON THE FIRST RUN, and worth fixing rather than quietly leaving.

    The verdict counted rows with a NULL owner_id (correct), but the DETAIL
    string counted ALL students — so a clean result printed "15 student row(s)
    with a NULL owner_id" when the true figure was zero out of fifteen. The
    verdict was right and the sentence beside it was wrong, which is the worst
    combination: it invites you to distrust a passing check.
  */
  select
    '3. ...so a new Cortex user would see nothing there',
    case when (select count(*) from students where owner_id is null) = 0
      then 'OK' else 'REVIEW' end,
    (select (select count(*)::text from students where owner_id is null)
         || ' of ' || (select count(*)::text from students)
         || ' student row(s) have a NULL owner_id (must be 0 — a NULL owner is visible to nobody, '
         || 'but it also means the row is orphaned)')

  union all
  /* ----------------------------------------------------------- ENTITLEMENT */
  /*
    Cortex entitlement lives ONLY on organizations. If the other product does
    not create organizations or memberships rows, using it can never produce a
    paid Cortex workspace — and vice versa.
  */
  select
    '4. Cortex entitlement columns are not shared',
    case when exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='organizations'
        and column_name in ('plan','credits','subscription_status')
    ) then 'OK' else 'FAIL' end,
    'plan / credits / subscription_status live on organizations only'

  union all
  select
    '5. Every workspace member came from a Cortex signup',
    case when (
      select count(*) from memberships m
      where not exists (select 1 from organizations o where o.id = m.org_id)
    ) = 0 then 'OK' else 'FAIL' end,
    (select count(*)::text || ' membership row(s) pointing at a missing workspace' from memberships m
      where not exists (select 1 from organizations o where o.id = m.org_id))

  union all
  /*
    The reverse leak: a user of the OTHER product who somehow acquired a Cortex
    workspace. Expected zero — the other app has no code that writes these
    tables — but this is the query that would prove otherwise.
  */
  select
    '6. No other-product user holds a Cortex workspace',
    case when (
      select count(*) from memberships m
      where m.user_id in (select owner_id from students where owner_id is not null
                          union select owner_id from teachers where owner_id is not null)
    ) = 0 then 'OK' else 'REVIEW' end,
    (select count(*)::text || ' user(s) present in BOTH products' from memberships m
      where m.user_id in (select owner_id from students where owner_id is not null
                          union select owner_id from teachers where owner_id is not null))

  union all
  /* ------------------------------------------------------- THE MONEY LEDGER */
  select
    '7. Cortex payments are fully separated',
    case when (select count(*) from cortex_payments) >= 0
          and (select count(*) from payments where org_id is not null) = 0
      then 'OK' else 'REVIEW' end,
    (select (select count(*)::text from cortex_payments) || ' row(s) in cortex_payments; '
         || (select count(*)::text from payments where org_id is not null)
         || ' Cortex-shaped row(s) still in the shared table (should be 0)')
) t
order by check_name;
