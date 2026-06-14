import type { HealthMetric, AIInsight, Alert } from "@/types";

export const demoMetrics: HealthMetric[] = [
  { id:"1", metric_key:"revenue", label:"Revenue (MTD)", value:42500000, unit:"INR", delta_pct:12, status:"green", trend:[31,33,34,36,38,40,42.5] },
  { id:"2", metric_key:"net_profit", label:"Net Profit", value:5100000, unit:"INR", delta_pct:-7, status:"yellow", trend:[6.1,5.9,5.7,5.6,5.4,5.2,5.1] },
  { id:"3", metric_key:"cash", label:"Cash Runway", value:5, unit:"months", delta_pct:-1, status:"yellow", trend:[8,7.5,7,6.5,6,5.5,5] },
  { id:"4", metric_key:"inventory", label:"Inventory Cover", value:9, unit:"days", delta_pct:-22, status:"red", trend:[24,21,18,15,13,11,9] },
  { id:"5", metric_key:"orders", label:"Open Orders", value:184, unit:"count", delta_pct:8, status:"green", trend:[150,158,162,170,175,180,184] },
  { id:"6", metric_key:"productivity", label:"Productivity", value:86, unit:"index", delta_pct:-7, status:"yellow", trend:[93,92,91,90,89,87,86] },
  { id:"7", metric_key:"growth", label:"Growth (YoY)", value:18, unit:"%", delta_pct:3, status:"green", trend:[12,13,14,15,16,17,18] },
  { id:"8", metric_key:"risk", label:"Risk Score", value:38, unit:"score", delta_pct:5, status:"yellow", trend:[28,30,31,33,35,37,38] },
  { id:"9", metric_key:"csat", label:"Customer Sat.", value:4.4, unit:"/5", delta_pct:2, status:"green", trend:[4.2,4.2,4.3,4.3,4.4,4.4,4.4] },
  { id:"10", metric_key:"working_capital", label:"Working Capital", value:18900000, unit:"INR", delta_pct:-4, status:"yellow", trend:[21,20.5,20,19.6,19.3,19,18.9] },
  { id:"11", metric_key:"receivables", label:"Receivables Overdue", value:7200000, unit:"INR", delta_pct:14, status:"red", trend:[4.8,5.2,5.8,6.2,6.6,7,7.2] },
  { id:"12", metric_key:"gross_margin", label:"Gross Margin", value:31, unit:"%", delta_pct:-2, status:"yellow", trend:[34,33.5,33,32.5,32,31.5,31] },
];

export const demoInsights: AIInsight[] = [
  { id:"i1", module:"health", severity:"green", title:"Revenue up 12% this month", detail:"Driven by repeat orders in the West region and the new SKU line. Momentum is healthy.", confidence:0.91, recommended_actions:["Double down on West region distributor incentives","Expand the new SKU to South region"] },
  { id:"i2", module:"finance", severity:"yellow", title:"Net profit down 7% despite higher revenue", detail:"Raw material prices rose 9% and were not passed through. Gross margin slipped from 33% to 31%.", confidence:0.88, recommended_actions:["Increase prices 4% on low-elasticity SKUs","Renegotiate top-3 supplier contracts"] },
  { id:"i3", module:"inventory", severity:"red", title:"Stockout expected in ~9 days", detail:"Raw material RM-204 is consuming faster than its 12-day lead time. Production line B is at risk.", confidence:0.84, recommended_actions:["Approve AI-drafted PO #PO-4471 (10,000 units)","Add a backup supplier for RM-204"] },
  { id:"i4", module:"hr", severity:"yellow", title:"Productivity down 7% in Packing", detail:"Three high performers show elevated attrition risk. Overtime is climbing.", confidence:0.79, recommended_actions:["Schedule retention conversations","Add a second packing shift"] },
];

export const demoAlerts: Alert[] = [
  { id:"a1", severity:"red", title:"Receivables overdue crossed ₹72L", body:"5 customers are >45 days past due.", module:"finance", is_read:false, created_at:"" },
  { id:"a2", severity:"red", title:"RM-204 will stock out in 9 days", body:"Reorder now to protect Line B output.", module:"inventory", is_read:false, created_at:"" },
  { id:"a3", severity:"yellow", title:"Machine M-3 OEE below 70%", body:"Downtime spiked on the night shift.", module:"production", is_read:false, created_at:"" },
  { id:"a4", severity:"green", title:"New SKU crossed ₹50L in sales", body:"Fastest-ramping product this quarter.", module:"sales", is_read:true, created_at:"" },
];

export const demoRevenueSeries = Array.from({ length: 12 }, (_, m) => ({
  month: new Date(2025, m, 1).toLocaleString("en", { month: "short" }),
  revenue: 30 + m * 1.1, profit: 4.2 + m * 0.09, cash: 22 - m * 0.25,
}));

export const demoContext = `BUSINESS SNAPSHOT (demo company — manufacturing SME, ~₹25 Cr revenue):
- Revenue MTD ₹4.25 Cr, up 12% MoM. YoY growth 18%.
- Net profit ₹51 L, DOWN 7% — raw material RM-204 up 9%, margin slipped 33%->31%.
- Cash runway ~5 months and shrinking. Working capital ₹1.89 Cr.
- Receivables overdue ₹72 L (up 14%); 5 customers >45 days past due.
- Inventory cover only 9 days for RM-204 vs 12-day lead time -> stockout risk on Line B. AI drafted PO-4471 for 10,000 units.
- Productivity down 7%, concentrated in Packing; 3 high performers at attrition risk.
- Sales: West region strongest; new Premium-X SKU ramping fast; a competitor cut entry-tier prices 8%.
- Top overdue invoice: Apex Traders ₹18 L, 48 days late.`;
