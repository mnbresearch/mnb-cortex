import "server-only";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { demoMetrics, demoInsights, demoAlerts, demoContext } from "@/lib/demo";
import type { HealthMetric, AIInsight, Alert } from "@/types";

export async function getUserAndOrg() {
  if (!hasSupabase()) return { user: null, orgId: null as string | null };
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { user: null, orgId: null };
    const { data } = await sb.from("memberships").select("org_id").eq("user_id", user.id).limit(1).single();
    return { user, orgId: data?.org_id ?? null };
  } catch { return { user: null, orgId: null }; }
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
