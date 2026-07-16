-- ============================================================
-- MNB CORTEX — Demo data
-- Provides seed_demo_data(org_id) so any org can be filled with
-- realistic numbers. Also seeds a standalone demo org you can
-- explore before signing up real users.
-- Run AFTER schema.sql + rls.sql.
-- ============================================================

create or replace function public.seed_demo_data(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m int;
begin
  delete from health_metrics where org_id = p_org;
  delete from ai_insights where org_id = p_org;
  delete from alerts where org_id = p_org;
  delete from finance_ledger where org_id = p_org;
  delete from sales_orders where org_id = p_org;
  delete from sales_pipeline where org_id = p_org;
  delete from production_runs where org_id = p_org;
  delete from inventory_items where org_id = p_org;
  delete from purchase_orders where org_id = p_org;
  delete from employees where org_id = p_org;
  delete from invoices where org_id = p_org;
  delete from market_reports where org_id = p_org;
  delete from workflows where org_id = p_org;
  delete from meetings where org_id = p_org;
  delete from documents where org_id = p_org;

  -- Health metrics (the 12 KPIs the owner sees)
  insert into health_metrics (org_id, metric_key, label, value, unit, delta_pct, status, trend) values
    (p_org,'revenue','Revenue (MTD)', 42500000, 'INR', 12.0, 'green', array[31,33,34,36,38,40,42.5]),
    (p_org,'net_profit','Net Profit', 5100000, 'INR', -7.0, 'yellow', array[6.1,5.9,5.7,5.6,5.4,5.2,5.1]),
    (p_org,'cash','Cash Runway', 5, 'months', -1.0, 'yellow', array[8,7.5,7,6.5,6,5.5,5]),
    (p_org,'inventory','Inventory Cover', 9, 'days', -22.0, 'red', array[24,21,18,15,13,11,9]),
    (p_org,'orders','Open Orders', 184, 'count', 8.0, 'green', array[150,158,162,170,175,180,184]),
    (p_org,'productivity','Employee Productivity', 86, 'index', -7.0, 'yellow', array[93,92,91,90,89,87,86]),
    (p_org,'growth','Growth Rate (YoY)', 18, '%', 3.0, 'green', array[12,13,14,15,16,17,18]),
    (p_org,'risk','Risk Score', 38, 'score', 5.0, 'yellow', array[28,30,31,33,35,37,38]),
    (p_org,'csat','Customer Satisfaction', 4.4, '/5', 2.0, 'green', array[4.2,4.2,4.3,4.3,4.4,4.4,4.4]),
    (p_org,'working_capital','Working Capital', 18900000, 'INR', -4.0, 'yellow', array[21,20.5,20,19.6,19.3,19,18.9]),
    (p_org,'receivables','Receivables Overdue', 7200000, 'INR', 14.0, 'red', array[4.8,5.2,5.8,6.2,6.6,7.0,7.2]),
    (p_org,'gross_margin','Gross Margin', 31, '%', -2.0, 'yellow', array[34,33.5,33,32.5,32,31.5,31]);

  -- AI insights
  insert into ai_insights (org_id, module, severity, title, detail, confidence, recommended_actions) values
    (p_org,'health','green','Revenue up 12% this month','Driven by repeat orders in the West region and the new SKU line. Momentum is healthy.',0.91,'["Double down on West region distributor incentives","Expand the new SKU to South region"]'),
    (p_org,'finance','yellow','Net profit down 7% despite higher revenue','Raw material prices rose 9% and were not passed through. Gross margin slipped from 33% to 31%.',0.88,'["Increase prices 4% on low-elasticity SKUs","Renegotiate top-3 supplier contracts"]'),
    (p_org,'inventory','red','Stockout expected in ~9 days','Raw material RM-204 is consuming faster than the lead time of 12 days. Production line B is at risk.',0.84,'["Approve AI-drafted PO #PO-4471 (10,000 units)","Add backup supplier for RM-204"]'),
    (p_org,'hr','yellow','Employee productivity down 7%','Concentrated in the Packing department. 3 high performers show elevated attrition risk.',0.79,'["Schedule retention conversations with at-risk staff","Add a second packing shift"]'),
    (p_org,'market','yellow','Competitor launched a cheaper product','A regional competitor cut prices 8% on the entry SKU. Expect pressure in price-sensitive segments.',0.72,'["Introduce a value-tier SKU","Bundle to defend the premium tier"]');

  -- Alerts
  insert into alerts (org_id, severity, title, body, module) values
    (p_org,'red','Receivables overdue crossed ₹72L','5 customers are >45 days past due. Cash impact is material.','finance'),
    (p_org,'red','RM-204 will stock out in 9 days','Reorder now to protect Line B output.','inventory'),
    (p_org,'yellow','Machine M-3 OEE fell below 70%','Downtime spiked on night shift.','production'),
    (p_org,'green','New SKU crossed ₹50L in sales','Fastest-ramping product this quarter.','sales');

  -- Finance ledger — 12 months
  for m in 0..11 loop
    insert into finance_ledger (org_id, period, revenue, cogs, opex, gross_profit, net_profit, cash_balance, receivables, payables, ebitda)
    values (p_org, (date_trunc('month', current_date) - ((11-m) || ' months')::interval)::date,
      30000000 + m*1100000, 19000000 + m*820000, 6000000 + m*120000,
      11000000 + m*280000, 4200000 + m*90000, 22000000 - m*250000,
      4800000 + m*220000, 6200000 + m*90000, 5200000 + m*120000);
  end loop;

  -- Sales orders
  insert into sales_orders (org_id, order_no, customer_name, region, product, amount, status, is_repeat, order_date)
  select p_org, 'SO-'||g, (array['Apex Traders','Sunrise Retail','Nova Distributors','Gulf Imports','Metro Mart','Pioneer Exports'])[1+(g%6)],
    (array['West','South','North','East','Export'])[1+(g%5)],
    (array['Alpha-100','Beta-200','Gamma-300','Value-Tier','Premium-X'])[1+(g%5)],
    150000 + (g%9)*85000, (array['won','won','won','open','lost'])[1+(g%5)], (g%3=0),
    current_date - (g||' days')::interval
  from generate_series(1,60) g;

  insert into sales_pipeline (org_id, stage, deal_name, customer_name, value, probability, expected_close) values
    (p_org,'lead','Bulk supply – Q3','Horizon Mfg', 2400000, 0.2, current_date+25),
    (p_org,'qualified','Export pilot – UAE','Gulf Imports', 5600000, 0.4, current_date+40),
    (p_org,'proposal','Annual contract','Metro Mart', 8900000, 0.6, current_date+18),
    (p_org,'negotiation','Premium-X rollout','Sunrise Retail', 3300000, 0.75, current_date+10),
    (p_org,'won','Repeat order','Apex Traders', 1700000, 1.0, current_date-2);

  -- Production runs (last 14 days x 2 machines)
  insert into production_runs (org_id, machine, shift, run_date, planned_qty, actual_qty, reject_qty, downtime_min, oee, energy_kwh)
  select p_org, (array['M-1','M-2','M-3'])[1+(g%3)], (array['Day','Night'])[1+(g%2)],
    current_date-(g/3)::int, 1000, 1000-(g%3)*70-(g%5)*20, (g%5)*8, (g%4)*35,
    62+(g%3)*9+(g%2)*4, 480+(g%3)*40
  from generate_series(0,27) g;

  -- Inventory
  insert into inventory_items (org_id, sku, name, category, on_hand, reorder_level, safety_stock, daily_consumption, unit_cost, movement, supplier, lead_time_days) values
    (p_org,'RM-204','Polymer Resin Grade A','raw', 4200, 6000, 3000, 480, 145, 'fast','PetroChem Ltd', 12),
    (p_org,'RM-118','Steel Sheet 2mm','raw', 18000, 8000, 4000, 350, 78, 'fast','Tata Supply', 7),
    (p_org,'FG-Alpha100','Alpha-100 Finished','finished', 920, 500, 300, 60, 640, 'fast','—', 0),
    (p_org,'FG-ValueT','Value-Tier Finished','finished', 220, 400, 200, 45, 410, 'slow','—', 0),
    (p_org,'RM-330','Packaging Cartons','raw', 26000, 10000, 5000, 300, 12, 'slow','BoxWorks', 5),
    (p_org,'FG-Legacy','Legacy SKU (EOL)','finished', 1400, 0, 0, 2, 300, 'dead','—', 0);

  insert into purchase_orders (org_id, po_no, supplier, item, qty, amount, status, created_by_ai) values
    (p_org,'PO-4471','PetroChem Ltd','RM-204 Polymer Resin', 10000, 1450000, 'draft', true),
    (p_org,'PO-4468','Tata Supply','RM-118 Steel Sheet', 5000, 390000, 'sent', false);

  -- HR
  insert into employees (org_id, name, department, role, attendance_pct, performance, attrition_risk, overtime_hrs, monthly_ctc) values
    (p_org,'Rahul Mehta','Production','Line Supervisor', 97, 4.6, 0.62, 28, 65000),
    (p_org,'Sneha Iyer','Sales','Regional Manager', 95, 4.8, 0.55, 12, 110000),
    (p_org,'Arjun Rao','Packing','Operator', 88, 3.1, 0.71, 40, 28000),
    (p_org,'Priya Nair','Finance','Accountant', 99, 4.2, 0.12, 5, 55000),
    (p_org,'Vikram Singh','Production','Operator', 91, 3.6, 0.34, 22, 30000),
    (p_org,'Anita Desai','HR','Executive', 98, 4.0, 0.18, 3, 45000);

  insert into invoices (org_id, invoice_no, party, amount, due_date, status, type) values
    (p_org,'INV-2210','Apex Traders', 1800000, current_date-48, 'overdue','receivable'),
    (p_org,'INV-2215','Metro Mart', 2400000, current_date-12, 'pending','receivable'),
    (p_org,'INV-2219','Gulf Imports', 3000000, current_date+8, 'pending','receivable'),
    (p_org,'BILL-881','PetroChem Ltd', 1450000, current_date+5, 'pending','payable');

  insert into market_reports (org_id, title, query, market_size, growth_forecast, competitors, entry_barriers, recommendation) values
    (p_org,'UAE Expansion Scan','Should I enter the UAE market?','$2.1B addressable','7.4% CAGR to 2030',
     '[{"name":"Regional Co A","share":"22%"},{"name":"Importer B","share":"15%"}]',
     '["Distributor relationships","Halal/regulatory certification","Logistics cost"]',
     'Enter via a Dubai distributor partnership in H2. Pilot with Premium-X before committing capex.');

  insert into workflows (org_id, name, trigger, steps, is_active, last_run) values
    (p_org,'Daily cash & receivables digest','schedule','["Pull ledger","Flag overdue >30d","Email owner 8am"]', true, now()-interval '6 hours'),
    (p_org,'Auto reorder on stockout risk','event','["Detect cover < lead time","Draft PO","Notify for approval"]', true, now()-interval '2 hours'),
    (p_org,'WhatsApp payment reminders','schedule','["Find overdue invoices","Send WhatsApp","Log response"]', true, now()-interval '1 day');

  insert into meetings (org_id, title, platform, meeting_date, summary, action_items) values
    (p_org,'Weekly Ops Review','meet', now()-interval '2 days',
     'Reviewed Line B risk, agreed to approve RM-204 PO and add a backup supplier. Sales confirmed Premium-X ramp.',
     '[{"owner":"Procurement","task":"Approve PO-4471","due":"Tomorrow"},{"owner":"Sales","task":"Send UAE pilot proposal","due":"Friday"}]');

  insert into documents (org_id, name, type, summary, risk_flags) values
    (p_org,'Supplier_Contract_PetroChem.pdf','contract','3-year supply contract; price revision clause every 6 months.','["No price cap on revisions","Auto-renewal unless 60-day notice"]'),
    (p_org,'GST_Return_May.pdf','pdf','GSTR-3B for May. Net tax ₹4.1L. Filed on time.','[]');
end $$;

-- Optional: seed every existing org once (safe to re-run).
do $$
declare o uuid;
begin
  for o in select id from organizations loop
    perform public.seed_demo_data(o);
  end loop;
end $$;
