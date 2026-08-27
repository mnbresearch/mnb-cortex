-- ============================================================================
-- Link sales_orders to customers properly, instead of matching on raw name.
--
-- THE BUG THIS FIXES
--
-- sales_orders carries `customer_name text` and no foreign key, so /rfm and
-- /churn joined a customer to their orders with:
--
--     String(name).trim().toLowerCase()
--
-- That is wrong in both directions, and both failures are silent:
--
--   FALSE NEGATIVE - "Acme Pvt. Ltd." and "Acme Private Limited" are the same
--     customer written two ways. They do not match, so a real customer scores
--     zero orders and lands in "Lost" on the RFM board, or gets flagged as
--     churn risk while actively buying. The owner then chases a customer who
--     never left, or writes off one who never went anywhere.
--
--   FALSE POSITIVE - two genuinely different customers who share a name get
--     merged into one score. Their revenue is added together and attributed to
--     whichever record happens to be first.
--
-- Neither shows up as an error. The page renders a confident number that is
-- simply about the wrong customer.
--
-- WHAT THIS DOES
--
--   1. Adds sales_orders.customer_id, a real FK.
--   2. Adds cortex_norm_name(), the canonical name-normalisation rule.
--   3. Backfills customer_id ONLY where exactly one customer matches.
--
-- Point 3 is the important restraint. Where a name is ambiguous the row is
-- left NULL rather than linked to a guess: a wrong link is permanent and
-- invisible, while a NULL is honest and can be resolved later. The app reports
-- the ambiguous ones instead of silently picking one.
-- ============================================================================

alter table sales_orders
  add column if not exists customer_id uuid references customers(id) on delete set null;

-- ----------------------------------------------------------------------------
-- The canonical normalisation rule.
--
-- IMMUTABLE so it can be used in an index. This MUST stay behaviourally
-- identical to normalizeCustomerName() in src/lib/customer-match.ts -- the
-- backfill below uses this version while the running app uses the TypeScript
-- one, so any drift between them means rows link one way and are matched
-- another. scripts/test-customer-match.mjs asserts the two agree, against real
-- Postgres, for exactly that reason.
--
-- Deliberately NOT stripped: the legal form. "Acme Private Limited" and
-- "Acme Limited" are different legal entities, so they must not collapse into
-- each other. What IS normalised is spelling variants of the SAME form --
-- "Pvt. Ltd." / "Private Limited" / "pvt ltd" are one company written three
-- ways, which is the case that actually occurs on Indian invoices.
-- ----------------------------------------------------------------------------
create or replace function cortex_norm_name(raw text)
returns text
language sql
immutable
as $$
  with lowered   as (select lower(coalesce(raw, ''))                        as t),
       ampersand as (select replace(t, '&', ' and ')                        as t from lowered),
       -- Strip punctuation to spaces: "Acme Pvt. Ltd." -> "acme pvt ltd "
       stripped  as (select regexp_replace(t, '[^a-z0-9]+', ' ', 'g')       as t from ampersand),
       -- Canonicalise spelling variants of the same legal form.
       f1        as (select regexp_replace(t, '\mprivate\M',      'pvt',  'g') as t from stripped),
       f2        as (select regexp_replace(t, '\mlimited\M',      'ltd',  'g') as t from f1),
       f3        as (select regexp_replace(t, '\mincorporated\M', 'inc',  'g') as t from f2),
       f4        as (select regexp_replace(t, '\mcorporation\M',  'corp', 'g') as t from f3),
       f5        as (select regexp_replace(t, '\mcompany\M',      'co',   'g') as t from f4),
       squeezed  as (select btrim(regexp_replace(t, '\s+', ' ', 'g'))          as t from f5),
       -- "M/s Acme Traders" is an address form, not part of the name.
       prefix    as (select regexp_replace(t, '^m s ', '', '')                 as t from squeezed)
  select nullif(btrim(t), '') from prefix
$$;

-- Matching indexes. Without these the backfill and the per-request lookups
-- both degrade to a sequential scan once an org has real order volume.
create index if not exists sales_orders_customer_id_idx
  on sales_orders (org_id, customer_id);
create index if not exists customers_org_norm_name_idx
  on customers (org_id, cortex_norm_name(name));
create index if not exists sales_orders_org_norm_name_idx
  on sales_orders (org_id, cortex_norm_name(customer_name));

-- ----------------------------------------------------------------------------
-- Keep the link current, for every writer.
--
-- WHY A TRIGGER AND NOT APPLICATION CODE. sales_orders is written from six
-- places: the Add-order form, the deal-won conversion, CSV import, import-from-
-- URL, the Tally/external sync upsert, and the public API -- which goes through
-- the `api_ingest` Postgres function and never touches the TypeScript at all.
-- Patching each call site would mean six chances to forget, one of them not
-- even reachable from the app code, and a seventh the next time someone adds a
-- writer. Doing it here means every path is covered by construction.
--
-- SECURITY INVOKER (the default) is deliberate: the lookup is explicitly scoped
-- to the row's own org_id, and for ordinary users RLS on `customers` is a
-- second bound on top of that. Making it SECURITY DEFINER would remove that
-- second bound for no benefit.
-- ----------------------------------------------------------------------------
create or replace function cortex_link_sales_order_customer()
returns trigger
language plpgsql
as $$
declare
  v_key        text;
  v_customer   uuid;
  v_candidates int;
begin
  -- An explicit id always wins; never second-guess a caller that knows.
  if new.customer_id is not null then return new; end if;

  v_key := cortex_norm_name(new.customer_name);
  if v_key is null then return new; end if;

  -- min(uuid) does not exist in Postgres, so compare as text. Which row is
  -- picked is irrelevant: it is only used when there is exactly one.
  select count(distinct c.id), min(c.id::text)::uuid
    into v_candidates, v_customer
    from customers c
   where c.org_id = new.org_id
     and cortex_norm_name(c.name) = v_key;

  -- Exactly one, or nothing. A guess here is permanent and unreviewable.
  if v_candidates = 1 then new.customer_id := v_customer; end if;
  return new;
end
$$;

drop trigger if exists sales_orders_link_customer on sales_orders;
create trigger sales_orders_link_customer
  before insert or update of customer_name, customer_id on sales_orders
  for each row execute function cortex_link_sales_order_customer();

-- ----------------------------------------------------------------------------
-- The reverse direction: orders usually arrive BEFORE the customer record.
--
-- A shop imports two years of sales history, then starts adding customers.
-- Without this, every one of those orders stays unlinked for ever and the
-- customer scores zero on the RFM board despite having a full order history.
-- When a customer is created or renamed, adopt the orders that unambiguously
-- belong to them.
-- ----------------------------------------------------------------------------
create or replace function cortex_adopt_orders_for_customer()
returns trigger
language plpgsql
as $$
declare
  v_key        text;
  v_candidates int;
begin
  v_key := cortex_norm_name(new.name);
  if v_key is null then return new; end if;

  -- If this org now has two customers sharing the name, the orders became
  -- ambiguous and must NOT be adopted by whichever was saved second.
  select count(distinct c.id) into v_candidates
    from customers c
   where c.org_id = new.org_id
     and cortex_norm_name(c.name) = v_key;
  if v_candidates <> 1 then return new; end if;

  update sales_orders o
     set customer_id = new.id
   where o.org_id = new.org_id
     and o.customer_id is null
     and cortex_norm_name(o.customer_name) = v_key;

  return new;
end
$$;

drop trigger if exists customers_adopt_orders on customers;
create trigger customers_adopt_orders
  after insert or update of name on customers
  for each row execute function cortex_adopt_orders_for_customer();

-- ----------------------------------------------------------------------------
-- Backfill. Only unambiguous matches are linked.
--
-- The `having count(*) = 1` is the whole point: if two customer records in the
-- same org normalise to the same name we genuinely cannot tell which one the
-- order belongs to, and inventing an answer would bake a wrong attribution
-- into the data permanently.
-- ----------------------------------------------------------------------------
with matches as (
  select o.id                as order_id,
         min(c.id::text)::uuid as customer_id,   -- no min(uuid) in Postgres
         count(distinct c.id) as candidates
    from sales_orders o
    join customers  c
      on c.org_id = o.org_id
     and cortex_norm_name(c.name) = cortex_norm_name(o.customer_name)
   where o.customer_id is null
     and cortex_norm_name(o.customer_name) is not null
   group by o.id
)
update sales_orders o
   set customer_id = m.customer_id
  from matches m
 where m.order_id = o.id
   and m.candidates = 1;
