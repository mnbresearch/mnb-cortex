"use server";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg, getBusinessContext } from "@/lib/data";
import { SUPER_ADMINS } from "@/lib/config";
import { generateFor } from "@/lib/ai/cortex";
import { sendEmail } from "@/lib/email";
import { recomputeQuietly } from "@/lib/metrics";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireOrg() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) throw new Error("Sign in to use this feature.");
  return orgId;
}

/**
 * Guard for actions that WRITE. Database policy now allows inserts and updates
 * from `analyst` and above, so without this a `viewer` would get the raw
 * Postgres string "new row violates row-level security policy" instead of an
 * explanation. Keeps the app's message and the DB's rule in agreement.
 */
async function requireWriteOrg() {
  const { orgId } = await requireRole("analyst");
  return orgId;
}
const num = (v: FormDataEntryValue | null) => { const n = parseFloat(String(v ?? "")); return isNaN(n) ? 0 : n; };
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function seedDemoData() {
  const orgId = await requireWriteOrg();
  const sb = createClient();
  const { error } = await sb.rpc("seed_demo_data", { p_org: orgId });
  if (error) throw new Error(error.message);
  ["/dashboard","/sales","/finance","/inventory","/hr","/settings"].forEach(p=>revalidatePath(p));
}

export async function updateOrgProfile(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const sb = createClient();
  const patch: any = { name: str(fd.get("name")) };
  const industry = str(fd.get("industry")); if (industry) patch.industry = industry;
  const rev = num(fd.get("annual_revenue_cr")); if (rev) patch.annual_revenue_cr = rev;
  const currency = str(fd.get("currency")); if (currency) patch.currency = currency;
  const accent = str(fd.get("accent")); if (accent) patch.accent = accent;
  const logo = str(fd.get("logo_url")); if (logo !== undefined) patch.logo_url = logo || null;
  const { error } = await sb.from("organizations").update(patch).eq("id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function addSalesOrder(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("sales_orders").insert({
    org_id: orgId, order_no: "SO-" + Date.now().toString().slice(-6),
    customer_name: str(fd.get("customer_name")), region: str(fd.get("region")) || "West",
    product: str(fd.get("product")), amount: num(fd.get("amount")),
    status: str(fd.get("status")) || "won", order_date: new Date().toISOString().slice(0,10) });
  if (error) throw new Error(error.message);
  await recomputeQuietly(orgId);
  revalidatePath("/sales"); revalidatePath("/dashboard");
}

export async function addInvoice(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("invoices").insert({
    org_id: orgId, invoice_no: "INV-" + Date.now().toString().slice(-6),
    party: str(fd.get("party")), amount: num(fd.get("amount")),
    status: str(fd.get("status")) || "pending", type: str(fd.get("type")) || "receivable",
    due_date: str(fd.get("due_date")) || new Date(Date.now()+15*864e5).toISOString().slice(0,10) });
  if (error) throw new Error(error.message);
  await recomputeQuietly(orgId);
  revalidatePath("/finance"); revalidatePath("/dashboard");
}

export async function addInventoryItem(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("inventory_items").insert({
    org_id: orgId, sku: str(fd.get("sku")), name: str(fd.get("name")),
    category: str(fd.get("category")) || "raw", on_hand: num(fd.get("on_hand")),
    reorder_level: num(fd.get("reorder_level")), unit_cost: num(fd.get("unit_cost")),
    supplier: str(fd.get("supplier")) });
  if (error) throw new Error(error.message);
  await recomputeQuietly(orgId);
  revalidatePath("/inventory"); revalidatePath("/dashboard");
}

export async function addEmployee(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("employees").insert({
    org_id: orgId, name: str(fd.get("name")), department: str(fd.get("department")),
    role: str(fd.get("role")), monthly_ctc: num(fd.get("monthly_ctc")),
    performance: num(fd.get("performance")) || 3.5 });
  if (error) throw new Error(error.message);
  await recomputeQuietly(orgId);
  revalidatePath("/hr"); revalidatePath("/dashboard");
}

export async function deleteRecord(fd: FormData) {
  const { orgId } = await requireRole("manager");
  const table = str(fd.get("table")); const id = str(fd.get("id")); const path = str(fd.get("path")) || "/dashboard";
  const allowed = ["sales_orders","invoices","inventory_items","employees","purchase_orders","documents","meetings","market_reports","strategy_docs","workflows","production_runs","customers","activity","invites","sales_pipeline"];
  if (!allowed.includes(table)) throw new Error("Invalid table");
  const sb = createClient();
  const { error } = await sb.from(table).delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  // Deleting rows changes the KPIs too — a workspace that clears its data must
  // fall back to an honest empty dashboard, not keep stale numbers.
  if (["sales_orders", "invoices", "inventory_items", "employees", "purchase_orders"].includes(table)) {
    await recomputeQuietly(orgId);
    revalidatePath("/dashboard");
  }
  revalidatePath(path);
}

export async function generatePO() {
  const orgId = await requireWriteOrg(); const sb = createClient();
  // Was hardcoded to "PetroChem Ltd / RM-204 Polymer Resin / ₹14.5 L" and written
  // straight into the customer's purchase_orders table. Now it drafts a PO for
  // the item that is genuinely most below its reorder level, or does nothing.
  const { data: items } = await sb.from("inventory_items")
    .select("sku,name,on_hand,reorder_level,unit_cost,supplier,daily_consumption")
    .eq("org_id", orgId).limit(2000);
  const low = ((items as any[]) || [])
    .filter((i) => Number(i.reorder_level) > 0 && Number(i.on_hand) < Number(i.reorder_level))
    .sort((a, b) => (Number(a.on_hand) / Number(a.reorder_level)) - (Number(b.on_hand) / Number(b.reorder_level)))[0];

  if (!low) {
    throw new Error("Nothing is below its reorder level right now, so there's no purchase order to draft.");
  }

  // Order back up to reorder level plus a fortnight of consumption.
  const qty = Math.max(1, Math.ceil((Number(low.reorder_level) - Number(low.on_hand)) + Number(low.daily_consumption || 0) * 14));
  const { error } = await sb.from("purchase_orders").insert({
    org_id: orgId, po_no: "PO-" + Date.now().toString().slice(-5),
    supplier: low.supplier || "To be assigned",
    item: [low.sku, low.name].filter(Boolean).join(" — ") || "Item",
    qty, amount: Math.round(qty * Number(low.unit_cost || 0)), status: "draft", created_by_ai: true });
  if (error) throw new Error(error.message);
  await logActivity(orgId, "ai", `AI drafted purchase order for ${low.sku || low.name} (${qty} units)`);
  revalidatePath("/inventory"); revalidatePath("/approvals");
}

export async function createInvoiceAI() {
  // Previously inserted a fictional ₹2.5 L invoice with party "Auto-generated
  // draft" into the customer's real ledger. An invoice is a legal document —
  // Cortex must never invent one. Send them to the real builder instead.
  redirect("/invoice");
}

export async function sendReminderAI() {
  const orgId = await requireWriteOrg();
  const { user } = await getUserAndOrg();
  const sb = createClient();

  // Was hardcoded to "Apex Traders ₹18 L (48 days)" — a real email, to the real
  // customer, about a company that does not exist. Read their actual ledger.
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await sb.from("invoices")
    .select("party,amount,due_date,status").eq("org_id", orgId).eq("type", "receivable")
    .neq("status", "paid").limit(500);
  const overdue = ((rows as any[]) || [])
    .filter((i) => i.status === "overdue" || (i.due_date && String(i.due_date) < today))
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  if (!overdue.length) {
    throw new Error("You have no overdue receivables right now — nothing to chase.");
  }

  const total = overdue.reduce((a, i) => a + Number(i.amount || 0), 0);
  const days = (d: any) => (d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86_400_000)) : 0);
  const top = overdue.slice(0, 5)
    .map((i) => `<li>${i.party || "Unnamed party"} — ₹${Number(i.amount || 0).toLocaleString("en-IN")}${i.due_date ? ` (${days(i.due_date)} days)` : ""}</li>`)
    .join("");

  let note = `Queued reminders for ${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"} worth ₹${total.toLocaleString("en-IN")}.`;
  if (user?.email) {
    const res = await sendEmail(user.email, "MNB Cortex — your overdue receivables",
      `<h2>${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}, ₹${total.toLocaleString("en-IN")} outstanding</h2><ul>${top}</ul>`);
    if (res.sent) note += ` Summary emailed to ${user.email}.`;
  }
  const { error } = await sb.from("alerts").insert({ org_id: orgId, severity: "yellow", module: "finance", title: "Overdue receivables", body: note });
  if (error) throw new Error(error.message);
  ["/dashboard", "/finance"].forEach((p) => revalidatePath(p));
}

export async function signOut() {
  const sb = createClient();
  await sb.auth.signOut();
  redirect("/login");
}

// ---- Persist AI artifacts ----
export async function saveArtifact(fd: FormData) {
  const orgId = await requireWriteOrg();
  const mode = str(fd.get("mode"));
  const title = str(fd.get("title")) || "Untitled";
  const content = str(fd.get("content"));
  const sb = createClient();
  let error: any = null;
  if (mode === "document") ({ error } = await sb.from("documents").insert({ org_id: orgId, name: title, type: "ai", summary: content }));
  else if (mode === "meeting") ({ error } = await sb.from("meetings").insert({ org_id: orgId, title, platform: "notes", summary: content }));
  else if (mode === "market") ({ error } = await sb.from("market_reports").insert({ org_id: orgId, title, query: title, recommendation: content }));
  else ({ error } = await sb.from("strategy_docs").insert({ org_id: orgId, framework: "analysis", question: title, content: { text: content } }));
  if (error) throw new Error(error.message);
  ["/documents", "/meetings", "/market", "/strategy"].forEach((p) => revalidatePath(p));
}

// ---- Workflows ----
export async function addWorkflow(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const steps = str(fd.get("steps")).split(",").map((s) => s.trim()).filter(Boolean);
  const { error } = await sb.from("workflows").insert({
    org_id: orgId, name: str(fd.get("name")), trigger: str(fd.get("trigger")) || "manual",
    steps, is_active: true });
  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
}

export async function runWorkflow(fd: FormData) {
  const orgId = await requireWriteOrg(); const id = str(fd.get("id")); const name = str(fd.get("name"));
  const sb = createClient();
  await sb.from("workflow_runs").insert({ org_id: orgId, workflow_id: id, status: "success", log: `Ran "${name}" — steps executed successfully.` });
  await sb.from("workflows").update({ last_run: new Date().toISOString() }).eq("id", id).eq("org_id", orgId);
  await sb.from("alerts").insert({ org_id: orgId, severity: "green", module: "workflow", title: `Workflow ran: ${name}`, body: "Executed successfully just now." });
  await logActivity(orgId, "workflow", `Ran workflow "${name}"`);
  revalidatePath("/workflows"); revalidatePath("/dashboard");
}

export async function updateStatus(fd: FormData) {
  const orgId = await requireWriteOrg();
  const table = str(fd.get("table")); const id = str(fd.get("id")); const status = str(fd.get("status"));
  const path = str(fd.get("path")) || "/approvals";
  const allowed: Record<string, string[]> = {
    purchase_orders: ["draft", "sent", "received"],
    invoices: ["pending", "paid", "overdue"],
    sales_orders: ["open", "won", "lost"],
  };
  if (!allowed[table] || !allowed[table].includes(status)) throw new Error("Invalid update");
  const sb = createClient();
  const { error } = await sb.from(table).update({ status }).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  await recomputeQuietly(orgId);
  await logActivity(orgId, "approval", `Set ${table} to ${status}`);
  ["/approvals", "/inventory", "/finance", "/sales", path].forEach((p) => revalidatePath(p));
}

const IMPORT_COLS: Record<string, { cols: string[]; nums: string[] }> = {
  sales_orders: { cols: ["order_no", "customer_name", "region", "product", "amount", "status"], nums: ["amount"] },
  invoices: { cols: ["invoice_no", "party", "amount", "due_date", "status", "type"], nums: ["amount"] },
  inventory_items: { cols: ["sku", "name", "category", "on_hand", "reorder_level", "unit_cost", "supplier"], nums: ["on_hand", "reorder_level", "unit_cost"] },
  employees: { cols: ["name", "department", "role", "monthly_ctc", "performance"], nums: ["monthly_ctc", "performance"] },
};

export async function importRows(fd: FormData): Promise<{ inserted: number; error?: string }> {
  try {
    const orgId = await requireWriteOrg();
    const table = str(fd.get("table"));
    const spec = IMPORT_COLS[table];
    if (!spec) return { inserted: 0, error: "Unsupported dataset" };
    let rows: any[] = [];
    try { rows = JSON.parse(str(fd.get("rows"))); } catch { return { inserted: 0, error: "Invalid data" }; }
    if (!Array.isArray(rows) || !rows.length) return { inserted: 0, error: "No rows to import" };
    const mapped = rows.slice(0, 1000).map((r) => {
      const o: any = { org_id: orgId };
      for (const c of spec.cols) {
        if (r[c] === undefined || r[c] === "") continue;
        o[c] = spec.nums.includes(c) ? (parseFloat(String(r[c]).replace(/[^0-9.-]/g, "")) || 0) : String(r[c]);
      }
      return o;
    });
    const sb = createClient();
    const { error } = await sb.from(table).insert(mapped);
    if (error) return { inserted: 0, error: error.message };
    await recomputeQuietly(orgId);
    await logActivity(orgId, "import", `Imported ${mapped.length} rows into ${table} (CSV)`);
    ["/sales", "/finance", "/inventory", "/hr", "/dashboard"].forEach((p) => revalidatePath(p));
    return { inserted: mapped.length };
  } catch (e: any) { return { inserted: 0, error: e?.message || "Import failed" }; }
}

// ---- Import from a public CSV / Google Sheets URL ----
export async function importFromUrl(fd: FormData): Promise<{ inserted: number; error?: string }> {
  try {
    const orgId = await requireWriteOrg();
    const table = str(fd.get("table"));
    const spec = IMPORT_COLS[table];
    if (!spec) return { inserted: 0, error: "Unsupported dataset" };
    const { toCsvUrl, parseCsv } = await import("@/lib/csv");
    const url = toCsvUrl(str(fd.get("url")));
    if (!/^https:\/\//.test(url)) return { inserted: 0, error: "Enter a valid https URL" };
    const res = await fetch(url, { headers: { "User-Agent": "MNBCortex" } });
    if (!res.ok) return { inserted: 0, error: `Could not fetch (${res.status}). Make sure the sheet/link is public.` };
    const rows = parseCsv(await res.text());
    if (!rows.length) return { inserted: 0, error: "No rows found at that URL" };
    const mapped = rows.slice(0, 1000).map((r) => {
      const o: any = { org_id: orgId };
      for (const c of spec.cols) { if (r[c] === undefined || r[c] === "") continue; o[c] = spec.nums.includes(c) ? (parseFloat(String(r[c]).replace(/[^0-9.-]/g, "")) || 0) : String(r[c]); }
      return o;
    });
    const sb = createClient();
    const { error } = await sb.from(table).insert(mapped);
    if (error) return { inserted: 0, error: error.message };
    await recomputeQuietly(orgId);
    await logActivity(orgId, "import", `Imported ${mapped.length} rows into ${table} (URL)`);
    ["/sales", "/finance", "/inventory", "/hr", "/dashboard", "/data"].forEach((p) => revalidatePath(p));
    return { inserted: mapped.length };
  } catch (e: any) { return { inserted: 0, error: e?.message || "Import failed" }; }
}

// ---- Integrations ----
export async function connectIntegration(fd: FormData) {
  const { orgId } = await requireRole("admin"); const sb = createClient();
  const provider = str(fd.get("provider"));
  let config: any = {}; try { const raw = str(fd.get("config")); if (raw) config = JSON.parse(raw); } catch {}
  const { error } = await sb.from("integrations").upsert({ org_id: orgId, provider, status: "connected", config }, { onConflict: "org_id,provider" });
  if (error) throw new Error(error.message);
  revalidatePath("/integrations");
}
export async function disconnectIntegration(fd: FormData) {
  const { orgId } = await requireRole("admin"); const sb = createClient();
  const { error } = await sb.from("integrations").delete().eq("org_id", orgId).eq("provider", str(fd.get("provider")));
  if (error) throw new Error(error.message);
  revalidatePath("/integrations");
}
export async function deleteLead(fd: FormData) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) throw new Error("Sign in to use this feature.");
  const id = str(fd.get("id"));
  const isSuper = SUPER_ADMINS.includes(String(user?.email || "").toLowerCase());
  if (isSuper) {
    const svc = serviceClient();
    if (svc) { const { error } = await svc.from("leads").delete().eq("id", id); if (error) throw new Error(error.message); revalidatePath("/leads"); return; }
  }
  const sb = createClient();
  const { error } = await sb.from("leads").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

// ---- Activity log helper ----
async function logActivity(orgId: string, type: string, message: string) {
  try { await createClient().from("activity").insert({ org_id: orgId, type, message }); } catch {}
}

// ---- CRM: customers ----
export async function addCustomer(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("customers").insert({
    org_id: orgId, name: str(fd.get("name")), company: str(fd.get("company")),
    email: str(fd.get("email")), phone: str(fd.get("phone")),
    status: str(fd.get("status")) || "lead", value: num(fd.get("value")) });
  if (error) throw new Error(error.message);
  await logActivity(orgId, "crud", `Added customer ${str(fd.get("name"))}`);
  revalidatePath("/customers");
}

// ---- Team invites ----
export async function inviteMember(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const { user } = await getUserAndOrg();
  const email = str(fd.get("email")); const role = str(fd.get("role")) || "analyst";
  if (!email) throw new Error("Email required");
  const sb = createClient();
  const org = await sb.from("organizations").select("name").eq("id", orgId).single();
  const orgName = (org.data as any)?.name || "our company";
  const { error } = await sb.from("invites").insert({ org_id: orgId, email, role });
  if (error) throw new Error(error.message);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mnb-cortex.vercel.app";
  await sendEmail(email, `You're invited to ${orgName} on MNB Cortex`,
    `<h2>You've been invited</h2><p>${user?.email || "A teammate"} invited you to join <b>${orgName}</b> on MNB Cortex as <b>${role}</b>.</p>
     <p>Sign in with this email address to accept: <a href="${appUrl}/login">${appUrl}/login</a></p>
     <p>— MNB Cortex, the AI COO for SMEs</p>`);
  await logActivity(orgId, "crud", `Invited ${email} as ${role}`);
  revalidatePath("/admin");
}
export async function cancelInvite(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  await sb.from("invites").delete().eq("org_id", orgId).eq("id", str(fd.get("id")));
  revalidatePath("/admin");
}

// ---- Role-based permissions ----
const ROLE_RANK: Record<string, number> = { viewer: 1, analyst: 2, manager: 3, admin: 4, owner: 5 };
async function requireRole(min: string) {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) throw new Error("Sign in to use this feature.");
  const sb = createClient();
  const { data } = await sb.from("memberships").select("role").eq("org_id", orgId).eq("user_id", user.id).single();
  const role = (data as any)?.role || "viewer";
  if ((ROLE_RANK[role] || 0) < (ROLE_RANK[min] || 0)) throw new Error(`This action requires the ${min} role or higher (you are ${role}).`);
  return { orgId, role };
}

// ---- Deals / pipeline ----
export async function addDeal(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("sales_pipeline").insert({
    org_id: orgId, stage: str(fd.get("stage")) || "lead", deal_name: str(fd.get("deal_name")),
    customer_name: str(fd.get("customer_name")), value: num(fd.get("value")),
    probability: (num(fd.get("probability")) || 30) / 100 });
  if (error) throw new Error(error.message);
  await logActivity(orgId, "crud", `Added deal ${str(fd.get("deal_name"))}`);
  revalidatePath("/pipeline");
}
export async function moveDeal(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("sales_pipeline").update({ stage: str(fd.get("stage")) }).eq("id", str(fd.get("id"))).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
}

// ---- API keys ----
export async function generateApiKey(fd: FormData) {
  const { orgId } = await requireRole("admin"); const sb = createClient();
  const key = "mnb_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const { error } = await sb.from("api_keys").insert({ org_id: orgId, label: str(fd.get("label")) || "API key", key });
  if (error) throw new Error(error.message);
  revalidatePath("/developers");
}
export async function deleteApiKey(fd: FormData) {
  const { orgId } = await requireRole("admin"); const sb = createClient();
  await sb.from("api_keys").delete().eq("id", str(fd.get("id"))).eq("org_id", orgId);
  revalidatePath("/developers");
}


// ---- AI Autopilot ----
export async function runAutopilot() {
  const orgId = await requireWriteOrg();
  const ctx = await getBusinessContext();
  const text = await generateFor("pulse", "", ctx);
  const sb = createClient();
  await sb.from("alerts").insert({ org_id: orgId, severity: "yellow", module: "autopilot", title: "Autopilot analysis", body: text.slice(0, 400) });
  await logActivity(orgId, "ai", "Autopilot ran a business analysis and posted findings");
  ["/autopilot", "/dashboard", "/activity"].forEach((p) => revalidatePath(p));
}

// ---- Shareable public report links ----
export async function createReportLink() {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const token = "r_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const { error } = await sb.from("report_links").insert({ org_id: orgId, token });
  if (error) throw new Error(error.message);
  revalidatePath("/reports");
}
export async function revokeReportLink(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  await sb.from("report_links").delete().eq("id", str(fd.get("id"))).eq("org_id", orgId);
  revalidatePath("/reports");
}
