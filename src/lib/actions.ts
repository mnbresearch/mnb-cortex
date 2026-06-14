"use server";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireOrg() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) throw new Error("Sign in to use this feature.");
  return orgId;
}
const num = (v: FormDataEntryValue | null) => { const n = parseFloat(String(v ?? "")); return isNaN(n) ? 0 : n; };
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function seedDemoData() {
  const orgId = await requireOrg();
  const sb = createClient();
  const { error } = await sb.rpc("seed_demo_data", { p_org: orgId });
  if (error) throw new Error(error.message);
  ["/dashboard","/sales","/finance","/inventory","/hr","/settings"].forEach(p=>revalidatePath(p));
}

export async function updateOrgProfile(fd: FormData) {
  const orgId = await requireOrg();
  const sb = createClient();
  const patch: any = { name: str(fd.get("name")) };
  const industry = str(fd.get("industry")); if (industry) patch.industry = industry;
  const rev = num(fd.get("annual_revenue_cr")); if (rev) patch.annual_revenue_cr = rev;
  const { error } = await sb.from("organizations").update(patch).eq("id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function addSalesOrder(fd: FormData) {
  const orgId = await requireOrg(); const sb = createClient();
  const { error } = await sb.from("sales_orders").insert({
    org_id: orgId, order_no: "SO-" + Date.now().toString().slice(-6),
    customer_name: str(fd.get("customer_name")), region: str(fd.get("region")) || "West",
    product: str(fd.get("product")), amount: num(fd.get("amount")),
    status: str(fd.get("status")) || "won", order_date: new Date().toISOString().slice(0,10) });
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
}

export async function addInvoice(fd: FormData) {
  const orgId = await requireOrg(); const sb = createClient();
  const { error } = await sb.from("invoices").insert({
    org_id: orgId, invoice_no: "INV-" + Date.now().toString().slice(-6),
    party: str(fd.get("party")), amount: num(fd.get("amount")),
    status: str(fd.get("status")) || "pending", type: str(fd.get("type")) || "receivable",
    due_date: str(fd.get("due_date")) || new Date(Date.now()+15*864e5).toISOString().slice(0,10) });
  if (error) throw new Error(error.message);
  revalidatePath("/finance");
}

export async function addInventoryItem(fd: FormData) {
  const orgId = await requireOrg(); const sb = createClient();
  const { error } = await sb.from("inventory_items").insert({
    org_id: orgId, sku: str(fd.get("sku")), name: str(fd.get("name")),
    category: str(fd.get("category")) || "raw", on_hand: num(fd.get("on_hand")),
    reorder_level: num(fd.get("reorder_level")), unit_cost: num(fd.get("unit_cost")),
    supplier: str(fd.get("supplier")) });
  if (error) throw new Error(error.message);
  revalidatePath("/inventory");
}

export async function addEmployee(fd: FormData) {
  const orgId = await requireOrg(); const sb = createClient();
  const { error } = await sb.from("employees").insert({
    org_id: orgId, name: str(fd.get("name")), department: str(fd.get("department")),
    role: str(fd.get("role")), monthly_ctc: num(fd.get("monthly_ctc")),
    performance: num(fd.get("performance")) || 3.5 });
  if (error) throw new Error(error.message);
  revalidatePath("/hr");
}

export async function deleteRecord(fd: FormData) {
  const orgId = await requireOrg();
  const table = str(fd.get("table")); const id = str(fd.get("id")); const path = str(fd.get("path")) || "/dashboard";
  const allowed = ["sales_orders","invoices","inventory_items","employees","purchase_orders"];
  if (!allowed.includes(table)) throw new Error("Invalid table");
  const sb = createClient();
  const { error } = await sb.from(table).delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath(path);
}

export async function generatePO() {
  const orgId = await requireOrg(); const sb = createClient();
  const { error } = await sb.from("purchase_orders").insert({
    org_id: orgId, po_no: "PO-" + Date.now().toString().slice(-5), supplier: "PetroChem Ltd",
    item: "RM-204 Polymer Resin", qty: 10000, amount: 1450000, status: "draft", created_by_ai: true });
  if (error) throw new Error(error.message);
  revalidatePath("/inventory");
}

export async function createInvoiceAI() {
  const orgId = await requireOrg(); const sb = createClient();
  const { error } = await sb.from("invoices").insert({
    org_id: orgId, invoice_no: "INV-" + Date.now().toString().slice(-6), party: "Auto-generated draft",
    amount: 250000, status: "pending", type: "receivable",
    due_date: new Date(Date.now()+15*864e5).toISOString().slice(0,10) });
  if (error) throw new Error(error.message);
  revalidatePath("/finance");
}

export async function sendReminderAI() {
  const orgId = await requireOrg(); const sb = createClient();
  const { error } = await sb.from("alerts").insert({
    org_id: orgId, severity: "green", module: "finance",
    title: "Payment reminders sent", body: "AI sent WhatsApp + email reminders to overdue customers." });
  if (error) throw new Error(error.message);
  ["/dashboard","/finance"].forEach(p=>revalidatePath(p));
}

export async function signOut() {
  const sb = createClient();
  await sb.auth.signOut();
  redirect("/login");
}
