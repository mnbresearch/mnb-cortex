/* ===========================================================================
   API KEYS WERE STORED IN PLAINTEXT. NOW ONLY A HASH IS.

   WHAT WAS WRONG

   `api_keys.key` held the key exactly as the customer uses it, and both
   api_ingest() and api_metrics() authenticated with `where key = p_key`. The
   generation is strong — two UUIDv4s, 244 bits from the platform CSPRNG, fixed
   earlier from a Math.random() version — but strong keys stored in clear are
   still clear.

   RLS on the table is correct, so no tenant can read another tenant's key.
   That is not the exposure. The exposure is every path that produces a copy of
   the table without going through RLS: a database backup, a snapshot restored
   to staging, the Supabase dashboard, a support export, or the service-role
   key leaking. In any of those, every customer's API key is immediately
   usable against their financial data, with no cracking step.

   A hash removes that entirely. A stolen table gives an attacker 64 hex
   characters and nothing to do with them.

   WHY "SHOWN ONCE" RATHER THAN ENCRYPT-AND-DISPLAY

   The dashboard used to print the key on every visit, so the obvious
   alternative was to encrypt it with the ENCRYPTION_KEY that already protects
   BYO provider keys, and decrypt for display. That works, and it is worse:

     - it keeps a reversible copy of a live credential, so the blast radius of
       an ENCRYPTION_KEY leak now includes every customer's API access
     - it means the server can always recover the key, which is exactly the
       property we are trying to remove
     - and it is not what anyone expects. GitHub, Stripe and OpenAI all show a
       key once and never again, so the behaviour needs no explanation.

   EXISTING KEYS KEEP WORKING. The backfill hashes what is already there, so no
   integration breaks on deploy. What changes is that the dashboard can no
   longer re-display them — it shows the prefix so a key is still identifiable,
   and a customer who has lost theirs rotates it.

   Safe to run, and safe to run twice.
   =========================================================================== */

alter table api_keys add column if not exists key_hash   text;
alter table api_keys add column if not exists key_prefix text;

/*
  Backfill BEFORE the lookup changes, so there is never a window where a live
  key authenticates against neither column.

  sha256() is a Postgres BUILTIN, not pgcrypto's digest(). schema.sql does
  enable pgcrypto, so digest() would have worked — but depending on an
  extension for the AUTHENTICATION path means a database restored or branched
  without it silently rejects every customer's API key. The builtin cannot be
  absent.
*/
update api_keys
   set key_hash   = encode(sha256(convert_to(key, 'UTF8')), 'hex'),
       key_prefix = left(key, 12)
 where key is not null and key_hash is null;

/* One key, one row. Also the index the lookup below rides on. */
create unique index if not exists api_keys_hash_uidx on api_keys(key_hash) where key_hash is not null;

/* ---------------------------------------------------------------- lookup ---
   Both functions now hash the presented key and compare hashes.

   Unchanged, and worth restating because it is what makes these safe to expose
   to `anon`: v_org comes from the key row, every insert forces v_org as the
   org_id, and p_table is matched against a hardcoded whitelist rather than
   interpolated. A key can only ever write into its own workspace.
   -------------------------------------------------------------------------- */

create or replace function public.api_ingest(p_key text, p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_count int := 0;
begin
  select org_id into v_org from api_keys
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;

  if p_table = 'sales_orders' then
    insert into sales_orders (org_id, order_no, customer_name, region, product, amount, status, order_date)
      select v_org, coalesce(r->>'order_no','SO-'||floor(random()*1e6)::int), r->>'customer_name', coalesce(r->>'region','West'),
             r->>'product', coalesce((r->>'amount')::numeric,0), coalesce(r->>'status','won'), current_date
      from jsonb_array_elements(p_rows) r;
  elsif p_table = 'invoices' then
    insert into invoices (org_id, invoice_no, party, amount, status, type, due_date)
      select v_org, coalesce(r->>'invoice_no','INV-'||floor(random()*1e6)::int), r->>'party',
             coalesce((r->>'amount')::numeric,0), coalesce(r->>'status','pending'), coalesce(r->>'type','receivable'),
             coalesce((r->>'due_date')::date, current_date+15)
      from jsonb_array_elements(p_rows) r;
  elsif p_table = 'inventory_items' then
    insert into inventory_items (org_id, sku, name, category, on_hand, reorder_level, unit_cost, supplier)
      select v_org, r->>'sku', r->>'name', coalesce(r->>'category','raw'), coalesce((r->>'on_hand')::numeric,0),
             coalesce((r->>'reorder_level')::numeric,0), coalesce((r->>'unit_cost')::numeric,0), r->>'supplier'
      from jsonb_array_elements(p_rows) r;
  elsif p_table = 'customers' then
    insert into customers (org_id, name, company, email, phone, status, value)
      select v_org, r->>'name', r->>'company', r->>'email', r->>'phone', coalesce(r->>'status','lead'), coalesce((r->>'value')::numeric,0)
      from jsonb_array_elements(p_rows) r;
  else
    return jsonb_build_object('ok', false, 'error', 'table not allowed');
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'inserted', v_count);
end $$;

create or replace function public.api_metrics(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v jsonb;
begin
  select org_id into v_org from api_keys
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;
  select jsonb_agg(jsonb_build_object('metric', metric_key, 'label', label, 'value', value, 'unit', unit, 'delta_pct', delta_pct, 'status', status))
    into v from health_metrics where org_id = v_org;
  return jsonb_build_object('ok', true, 'metrics', coalesce(v, '[]'::jsonb));
end $$;

/* Same grants as before — these authenticate on the key they are handed, not
   on the session, which is why cortex_definer_audit() lists them as reachable
   on purpose. */
revoke all on function public.api_ingest(text, text, jsonb) from public;
revoke all on function public.api_metrics(text)             from public;
grant execute on function public.api_ingest(text, text, jsonb) to anon, authenticated;
grant execute on function public.api_metrics(text)             to anon, authenticated;

/* ------------------------------------------------- drop the plaintext -----
   Last, and only for rows that have a hash — so a row that somehow failed the
   backfill keeps working rather than being silently bricked.

   `key` is left NULLABLE rather than dropped: dropping a column that older
   deployed code may still select would 500 every request to /developers during
   a rolling deploy. The column stays, empty.
   -------------------------------------------------------------------------- */
alter table api_keys alter column key drop not null;
update api_keys set key = null where key_hash is not null and key is not null;


/* ---------------------------------------------------------------- verify ---
   Expect: ok | ok | 0 | 0.
   -------------------------------------------------------------------------- */
select
  case when exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='api_keys' and column_name='key_hash')
       then 'ok' else 'MISSING' end                                as hash_column,
  case when exists (select 1 from pg_indexes
                     where schemaname='public' and indexname='api_keys_hash_uidx')
       then 'ok' else 'MISSING' end                                as hash_index,
  (select count(*) from api_keys where key is not null)            as plaintext_keys_remaining,
  (select count(*) from api_keys where key_hash is null)           as keys_without_a_hash;
