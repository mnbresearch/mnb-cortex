import "server-only";
import { cookies } from "next/headers";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { demoMetrics, demoInsights, demoAlerts, demoContext } from "@/lib/demo";
import type { HealthMetric, AIInsight, Alert } from "@/types";

export async function getUserAndOrg() {
  if (!hasSupabase()) return { user: null, orgId: null as string | null };
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { user: null, orgId: null };
    const { data } = await sb.from("memberships").select("org_id").eq("user_id", user.id);
    const ids = ((data as any[]) || []).map((m) => m.org_id);
    if (!ids.length) return { user, orgId: null };
    // Respect the workspace the user switched to, when they're still a member of it.
    const active = cookies().get("cortex_org")?.value;
    const orgId = active && ids.includes(active) ? active : ids[0];
    return { user, orgId };
  } catch { return { user: null, orgId: null }; }
}

/** All workspaces the signed-in user belongs to (for the switcher). */
export async function getMyOrgs(): Promise<{ id: string; name: string }[]> {
  const { user } = await getUserAndOrg();
  if (!user) return [];
  try {
    const sb = createClient();
    const { data } = await sb.from("memberships").select("org_id").eq("user_id", user.id);
    const ids = ((data as any[]) || []).map((m) => m.org_id);
    if (!ids.length) return [];
    const { data: orgs } = await sb.from("organizations").select("id,name").in("id", ids);
    return ((orgs as any[]) || []).map((o) => ({ id: o.id, name: o.name }));
  } catch { return []; }
}

async function currentOrg(): Promise<string | null> {
  const { orgId } = await getUserAndOrg();
  return orgId;
}

export async function getOrgProfile() {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return null;
  const sb = createClient();
  const { data } = await sb.from("organizations").select("*").eq("id", orgId).single();
  return data ? { ...data, userEmail: user?.email } : null;
}

export async function getMetrics(): Promise<HealthMetric[]> {
  const org = await currentOrg();
  if (!org) return demoMetrics;
  const sb = createClient();
  const { data } = await sb.from("health_metrics").select("*").eq("org_id", org);
  return data?.length ? (data as any) : demoMetrics;
}

export async function getInsights(module?: string): Promise<AIInsight[]> {
  const org = await currentOrg();
  if (!org) return module ? demoInsights.filter((i) => i.module === module) : demoInsights;
  const sb = createClient();
  let q = sb.from("ai_insights").select("*").eq("org_id", org);
  if (module) q = q.eq("module", module);
  const { data } = await q;
  if (data?.length) return data as any;
  return module ? demoInsights.filter((i) => i.module === module) : demoInsights;
}

export async function getAlerts(): Promise<Alert[]> {
  const org = await currentOrg();
  if (!org) return demoAlerts;
  const sb = createClient();
  const { data } = await sb.from("alerts").select("*").eq("org_id", org).order("created_at", { ascending: false });
  return data?.length ? (data as any) : demoAlerts;
}

// ---- entity fetchers (return real rows when logged in; [] otherwise) ----
async function fetchRows(table: string, order = "created_at") {
  const org = await currentOrg();
  if (!org) return { rows: [] as any[], live: false };
  const sb = createClient();
  const { data } = await sb.from(table).select("*").eq("org_id", org).order(order, { ascending: false }).limit(200);
  return { rows: (data as any[]) || [], live: true };
}
export const getSalesOrders = () => fetchRows("sales_orders", "order_date");
export const getInvoices = () => fetchRows("invoices", "created_at");
export const getInventory = () => fetchRows("inventory_items", "created_at");
export const getEmployees = () => fetchRows("employees", "created_at");
export const getPurchaseOrders = () => fetchRows("purchase_orders", "created_at");

export async function getBusinessContext(): Promise<string> {
  const m = await getMetrics();
  if (!m.length) return demoContext;
  const lines = m.map((x) => `- ${x.label}: ${x.value}${x.unit === "INR" ? " INR" : " " + x.unit} (${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, status ${x.status})`);
  const ins = await getInsights();
  const insLines = ins.map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`);
  return `KEY METRICS:\n${lines.join("\n")}\n\nACTIVE INSIGHTS:\n${insLines.join("\n")}`;
}

export const getDocumentsList = () => fetchRows("documents", "created_at");
export const getMeetingsList = () => fetchRows("meetings", "created_at");
export const getMarketList = () => fetchRows("market_reports", "created_at");
export const getStrategyList = () => fetchRows("strategy_docs", "created_at");
export const getWorkflowsList = () => fetchRows("workflows", "created_at");
export const getWorkflowRuns = () => fetchRows("workflow_runs", "ran_at");

export async function getFinanceSeries() {
  const org = await currentOrg();
  if (!org) return { series: null as any[] | null, live: false };
  const sb = createClient();
  const { data } = await sb.from("finance_ledger").select("*").eq("org_id", org).order("period", { ascending: true }).limit(12);
  if (!data?.length) return { series: null, live: false };
  const series = data.map((r: any) => ({
    month: new Date(r.period).toLocaleString("en", { month: "short" }),
    revenue: +(Number(r.revenue) / 1e7).toFixed(2),
    profit: +(Number(r.net_profit) / 1e7).toFixed(2),
    cash: +(Number(r.cash_balance) / 1e7).toFixed(2),
  }));
  return { series, live: true };
}

export async function getApprovals() {
  const org = await currentOrg();
  if (!org) return { pos: [] as any[], invoices: [] as any[], live: false };
  const sb = createClient();
  const [po, inv] = await Promise.all([
    sb.from("purchase_orders").select("*").eq("org_id", org).eq("status", "draft"),
    sb.from("invoices").select("*").eq("org_id", org).eq("status", "pending"),
  ]);
  return { pos: (po.data as any[]) || [], invoices: (inv.data as any[]) || [], live: true };
}

export async function getMembers() {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [] as any[], live: false };
  const sb = createClient();
  const { data } = await sb.from("memberships").select("role, user_id, created_at").eq("org_id", orgId).order("created_at", { ascending: true });
  const rows = (data as any[] || []).map((m) => ({
    id: m.user_id,
    name: m.user_id === user?.id ? (user?.email || "You") : "Team member",
    role: m.role,
  }));
  return { rows, live: true };
}

export async function getLeads() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [] as any[], live: false };
  const sb = createClient();
  const { data } = await sb.from("leads").select("*").order("created_at", { ascending: false }).limit(200);
  return { rows: (data as any[]) || [], live: true };
}

export async function getIntegrations() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { map: {} as Record<string, any>, live: false };
  const sb = createClient();
  const { data } = await sb.from("integrations").select("*").eq("org_id", orgId);
  const map: Record<string, any> = {};
  for (const r of (data as any[] || [])) map[r.provider] = r;
  return { map, live: true };
}

const EXPLORE_TABLES = ["sales_orders", "invoices", "inventory_items", "employees", "purchase_orders", "production_runs"];
export async function getTableRows(table: string, search: string, page: number) {
  const { orgId } = await getUserAndOrg();
  if (!EXPLORE_TABLES.includes(table)) return { rows: [], cols: [], live: false, total: 0 };
  if (!orgId) return { rows: [], cols: [], live: false, total: 0 };
  const sb = createClient();
  const per = 15; const from = page * per;
  let q = sb.from(table).select("*", { count: "exact" }).eq("org_id", orgId).order("created_at", { ascending: false }).range(from, from + per - 1);
  const { data, count } = await q;
  let rows = (data as any[]) || [];
  if (search) { const s = search.toLowerCase(); rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(s)); }
  const cols = rows.length ? Object.keys(rows[0]).filter((c) => c !== "org_id" && c !== "id") : [];
  return { rows, cols, live: true, total: count || 0 };
}
export { EXPLORE_TABLES };

export const getCustomers = () => fetchRows("customers", "created_at");

export async function getActivity() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [] as any[], live: false };
  const sb = createClient();
  const { data } = await sb.from("activity").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100);
  return { rows: (data as any[]) || [], live: true };
}

export async function getInvites() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [] as any[], live: false };
  const sb = createClient();
  const { data } = await sb.from("invites").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  return { rows: (data as any[]) || [], live: true };
}

export async function searchAll(q: string) {
  const { orgId } = await getUserAndOrg();
  if (!orgId || !q || q.length < 2) return [] as any[];
  const sb = createClient();
  const like = `%${q}%`;
  const out: any[] = [];
  const push = (rows: any[], type: string, label: (r: any) => string, sub: (r: any) => string, href: string) => {
    for (const r of rows || []) out.push({ type, label: label(r), sub: sub(r), href });
  };
  const [so, iv, it, em, cu] = await Promise.all([
    sb.from("sales_orders").select("order_no,customer_name,product,amount").eq("org_id", orgId).or(`customer_name.ilike.${like},product.ilike.${like},order_no.ilike.${like}`).limit(5),
    sb.from("invoices").select("invoice_no,party,amount").eq("org_id", orgId).or(`party.ilike.${like},invoice_no.ilike.${like}`).limit(5),
    sb.from("inventory_items").select("sku,name,on_hand").eq("org_id", orgId).or(`sku.ilike.${like},name.ilike.${like}`).limit(5),
    sb.from("employees").select("name,department,role").eq("org_id", orgId).or(`name.ilike.${like},department.ilike.${like},role.ilike.${like}`).limit(5),
    sb.from("customers").select("name,company,status").eq("org_id", orgId).or(`name.ilike.${like},company.ilike.${like}`).limit(5),
  ]);
  push(so.data as any[], "Sales", (r) => `${r.customer_name} · ${r.product || ""}`, (r) => `${r.order_no}`, "/data?table=sales_orders");
  push(iv.data as any[], "Invoice", (r) => `${r.party}`, (r) => `${r.invoice_no}`, "/data?table=invoices");
  push(it.data as any[], "Inventory", (r) => `${r.name} (${r.sku})`, (r) => `On hand: ${r.on_hand}`, "/data?table=inventory_items");
  push(em.data as any[], "Employee", (r) => `${r.name}`, (r) => `${r.department} · ${r.role}`, "/data?table=employees");
  push(cu.data as any[], "Customer", (r) => `${r.name}`, (r) => `${r.company || ""} · ${r.status}`, "/customers");
  return out.slice(0, 15);
}

export const getPipeline = () => fetchRows("sales_pipeline", "created_at");
export async function getApiKeys() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [] as any[], live: false };
  const sb = createClient();
  const { data } = await sb.from("api_keys").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  return { rows: (data as any[]) || [], live: true };
}

export async function getUsage() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { live: false, counts: {} as Record<string, number> };
  const sb = createClient();
  const tables = ["sales_orders", "invoices", "inventory_items", "employees", "customers", "documents"];
  const counts: Record<string, number> = {};
  await Promise.all(tables.map(async (t) => {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true }).eq("org_id", orgId);
    counts[t] = count || 0;
  }));
  return { live: true, counts };
}

export async function getReportLinks() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [] as any[], live: false };
  const sb = createClient();
  const { data } = await sb.from("report_links").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  return { rows: (data as any[]) || [], live: true };
}
