-- ============================================================================
-- Give the sample dataset actual CUSTOMERS.
--
-- THE GAP. seed_demo_data() creates 60 sales orders spread across six named
-- buyers, and zero rows in `customers`. So "Load a sample dataset" — the button
-- whose promise is "Fill every module with a realistic example business" —
-- leaves three modules completely empty:
--
--   /customers  the CRM: "No records yet."
--   /rfm        segmentation: nothing to segment
--   /churn      churn risk: nothing to score
--
-- Those are three of the modules a prospect is most likely to click, and they
-- are precisely the ones the demo fails to demo. Worse, the orders name six
-- buyers who visibly do not exist as contacts, so the sample data contradicts
-- itself.
--
-- WHY A SEPARATE FUNCTION rather than editing seed_demo_data(). That function
-- is ~150 lines and lives in supabase/seed.sql. Copying it into a migration to
-- add ten lines would create a second definition of it, and this codebase has
-- already been bitten by exactly that: seed_demo_data appeared to be defined in
-- three files, and cortex_norm_name had to be given a parity test to stop its
-- SQL and TypeScript versions drifting. A companion function the caller invokes
-- alongside the original keeps one definition of each.
--
-- The names match the buyers in seed_demo_data's orders, so the
-- customers_adopt_orders trigger (2026_sales_order_customer_link.sql) links the
-- existing 60 orders on insert. That also makes the sample data a live
-- demonstration of the matcher: "M/s Metro Mart" and "APEX TRADERS" are written
-- the way an Indian invoice actually writes them, and still attach to orders
-- booked as "Metro Mart" and "Apex Traders".
-- ============================================================================

-- customers was omitted from 2026_demo_isolation.sql, so without this the demo
-- rows below could never be removed — the same permanence bug that migration
-- was written to fix.
alter table customers add column if not exists is_demo boolean not null default false;
create index if not exists idx_customers_org_demo on customers (org_id) where is_demo;

create or replace function public.seed_demo_customers(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Scoped to is_demo, exactly like every delete in seed_demo_data: re-seeding
  -- replaces the previous sample contacts and never touches a real one.
  delete from customers where org_id = p_org and is_demo;

  insert into customers (org_id, name, company, email, phone, status, value, last_touch, notes, is_demo) values
    (p_org, 'Apex Traders',      'Apex Traders',            'accounts@apextraders.example',   '+91 98200 11223', 'active',  2940000, current_date - 3,  'Largest repeat buyer. Pays on time.', true),
    (p_org, 'Sunrise Retail',    'Sunrise Retail Pvt Ltd',  'buying@sunriseretail.example',   '+91 98200 22334', 'active',  2380000, current_date - 9,  'Growing steadily. Premium-X rollout in negotiation.', true),
    (p_org, 'Nova Distributors', 'Nova Distributors',       'orders@novadist.example',        '+91 98200 33445', 'active',  2210000, current_date - 14, 'Reliable mid-size distributor.', true),
    (p_org, 'M/s Metro Mart',    'Metro Mart',              'purchase@metromart.example',     '+91 98200 44556', 'active',  1980000, current_date - 21, 'Annual contract under proposal. Invoice INV-2215 outstanding.', true),
    (p_org, 'Gulf Imports',      'Gulf Imports FZE',        'imports@gulfimports.example',    '+971 50 123 4567','active',  1760000, current_date - 34, 'Export account. UAE pilot in progress.', true),
    /*
      Deliberately NOT marked churned with a "no order in three months" note.
      seed_demo_data spreads orders for every one of these buyers across the
      last 60 days, so such a note would be contradicted by the customer's own
      order history the moment the linking trigger attaches it — /churn would
      show "6 days idle" beside a churned badge. Sample data that argues with
      itself is exactly the defect this file was written to remove.
    */
    (p_org, 'Pioneer Exports',   'Pioneer Exports',         'contact@pioneerexports.example', '+91 98200 55667', 'active',  1540000, current_date - 6,  'Highest order value of the book. Export documentation runs long — watch the payment lag.', true);
end
$$;

revoke all on function public.seed_demo_customers(uuid) from public;
grant execute on function public.seed_demo_customers(uuid) to authenticated, service_role;

-- Attach the sample contacts to the sample orders that already exist. On a
-- workspace seeded before this migration the trigger has nothing to fire on,
-- so link them here too.
update sales_orders o
   set customer_id = c.id
  from customers c
 where c.org_id = o.org_id
   and c.is_demo
   and o.is_demo
   and o.customer_id is null
   and cortex_norm_name(c.name) = cortex_norm_name(o.customer_name);
