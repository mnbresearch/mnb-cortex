"use server";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg, getBusinessContext } from "@/lib/data";
import { seatLimit } from "@/lib/config";
import { SUPER_ADMINS } from "@/lib/operators";
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

/** Tables the demo seeder writes into, in child-before-parent order. */
const DEMO_TABLES = [
  "health_metrics", "ai_insights", "alerts", "finance_ledger",
  "sales_orders", "sales_pipeline", "production_runs", "inventory_items",
  "purchase_orders", "employees", "invoices", "market_reports",
  "workflows", "meetings", "documents",
];

const DEMO_PATHS = [
  "/dashboard", "/sales", "/finance", "/inventory", "/hr", "/production",
  "/settings", "/alerts", "/reorder", "/receivables", "/payables", "/pipeline",
];

export async function seedDemoData() {
  const orgId = await requireWriteOrg();
  const sb = createClient();
  const { error } = await sb.rpc("seed_demo_data", { p_org: orgId });
  if (error) throw new Error(error.message);
  await recomputeQuietly(orgId);
  DEMO_PATHS.forEach((p) => revalidatePath(p));
}

/**
 * Remove every demo row, leaving real data untouched.
 *
 * This was previously impossible. The seeder wrote cash_balance, net_profit and
 * ebitda into finance_ledger; recomputeMetrics owns only revenue/receivables/
 * payables/opex (the bank and GST readers own the rest and it must not destroy
 * a paid analysis). So demo cash outlived every recompute and sat on the
 * dashboard beside genuinely-derived real revenue for ever.
 *
 * Now that seeded rows carry is_demo, they can simply be deleted.
 */
export async function clearDemoData() {
  // Deleting rows requires manager+ at the database level (2026_tenancy.sql).
  // Gating this at analyst meant RLS filtered the deletes to zero rows and
  // returned SUCCESS — the page reloaded, the warning was still there, and
  // nothing said why.
  const { orgId } = await requireRole("manager");
  const sb = createClient();
  for (const t of DEMO_TABLES) {
    const { error } = await sb.from(t).delete().eq("org_id", orgId).eq("is_demo", true);
    // Keep going: one table failing must not strand the rest as demo data.
    if (error && !/column .*is_demo.* does not exist/i.test(error.message)) {
      throw new Error(`Could not clear demo ${t}: ${error.message}`);
    }
  }
  await recomputeQuietly(orgId);
  DEMO_PATHS.forEach((p) => revalidatePath(p));
}

/** Whether this workspace currently holds any demo rows. */
export async function hasDemoData(): Promise<boolean> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return false;
  const sb = createClient();
  for (const t of ["sales_orders", "finance_ledger", "inventory_items"]) {
    const { count } = await sb.from(t).select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("is_demo", true);
    if ((count || 0) > 0) return true;
  }
  return false;
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

/**
 * Suffix for a generated order/invoice number.
 *
 * This was the last 6 digits of Date.now(), which wraps every ~16.7 minutes.
 * That was harmless when duplicates were allowed; with a unique natural key a
 * collision becomes a hard error in the user's face. Base-36 seconds plus
 * randomness is short, sorts roughly by time, and won't realistically repeat.
 */
function seqSuffix(): string {
  const t = Math.floor(Date.now() / 1000).toString(36).toUpperCase().slice(-5);
  const r = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
  return `${t}${r}`;
}

export async function addSalesOrder(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("sales_orders").insert({
    org_id: orgId, order_no: "SO-" + seqSuffix(),
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
    org_id: orgId, invoice_no: "INV-" + seqSuffix(),
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
  // Every other writer recomputes; this one did not, so a drafted PO never
  // reached Working Capital until something else happened to trigger a rebuild.
  await recomputeQuietly(orgId);
  revalidatePath("/dashboard");
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
  // /alerts is where these land — it was not revalidated, so a reminder
  // raised an alert the alerts page would not show until something else
  // happened to invalidate it.
  ["/dashboard", "/finance", "/alerts"].forEach((p) => revalidatePath(p));
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
  const orgId = await requireWriteOrg();
  const id = str(fd.get("id")); const name = str(fd.get("name"));
  const sb = createClient();

  // This used to insert a row reading "steps executed successfully." and
  // execute nothing whatsoever. It now runs the steps and logs what each one
  // actually did — including, honestly, the ones it didn't understand.
  const { data: wf } = await sb.from("workflows").select("steps").eq("id", id).eq("org_id", orgId).maybeSingle();
  const steps: string[] = Array.isArray((wf as any)?.steps) ? (wf as any).steps : [];

  if (!steps.length) {
    await sb.from("workflow_runs").insert({ org_id: orgId, workflow_id: id, status: "failed", log: `"${name}" has no steps to run.` });
    revalidatePath("/workflows");
    throw new Error("This workflow has no steps yet. Edit it and add some.");
  }

  const { user } = await getUserAndOrg();
  const { executeWorkflow } = await import("@/lib/workflows");
  const run = await executeWorkflow(orgId, steps, { name, ownerEmail: user?.email });

  const log = `${name} — ${run.summary}\n` + run.results.map((r) => `${r.ok ? "✓" : r.skipped ? "–" : "✗"} ${r.step}: ${r.detail}`).join("\n");
  await sb.from("workflow_runs").insert({
    org_id: orgId, workflow_id: id,
    status: run.ok ? "success" : "failed",
    log: log.slice(0, 4000),
  });
  await sb.from("workflows").update({ last_run: new Date().toISOString() }).eq("id", id).eq("org_id", orgId);
  const { emitQuietly } = await import("@/lib/webhooks");
  emitQuietly(orgId, "workflow.completed", { name, ok: run.ok, summary: run.summary, steps: run.results });
  await logActivity(orgId, "workflow", `Ran workflow "${name}" — ${run.summary}`);
  ["/workflows", "/dashboard", "/alerts"].forEach((p) => revalidatePath(p));
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

/**
 * Write imported rows.
 *
 * sales_orders and invoices now carry a unique natural key, so a plain INSERT
 * makes re-uploading a corrected file fail the entire batch with a raw
 * "duplicate key value violates unique constraint". Upserting on that key is
 * what the user means by re-importing: same order number, updated figures.
 * Tables without a natural key keep insert semantics.
 */
const IMPORT_CONFLICT: Record<string, string> = {
  sales_orders: "org_id,order_no",
  invoices: "org_id,invoice_no",
};

async function writeImported(sb: any, table: string, mapped: any[]): Promise<{ written: number; error?: string }> {
  const conflict = IMPORT_CONFLICT[table];
  if (!conflict) {
    const { error } = await sb.from(table).insert(mapped);
    return error ? { written: 0, error: error.message } : { written: mapped.length };
  }

  const col = conflict.split(",")[1];
  const keyed = mapped.filter((r) => r[col]);
  const rest = mapped.filter((r) => !r[col]);

  // Last row wins for a natural key repeated inside one file — Postgres refuses
  // to let one statement touch the same row twice. The collapse is why the
  // caller is told how many rows were WRITTEN rather than how many were parsed.
  const byKey = new Map<string, any>();
  for (const r of keyed) byKey.set(String(r[col]), r);
  const unique = [...byKey.values()];

  let written = 0;
  if (unique.length) {
    const { error } = await sb.from(table).upsert(unique, { onConflict: conflict });
    if (error) {
      // 42P10 = the unique index this upsert needs isn't there yet. Importing
      // is more important than de-duplicating, so fall back to a plain insert
      // rather than blocking the user behind a migration.
      if (error.code === "42P10") {
        const { error: insErr } = await sb.from(table).insert(unique);
        if (insErr) return { written, error: insErr.message };
        written += unique.length;
      } else {
        return { written, error: error.message };
      }
    } else {
      written += unique.length;
    }
  }
  if (rest.length) {
    const { error } = await sb.from(table).insert(rest);
    // Report what actually landed: the upsert above may already have committed.
    if (error) return { written, error: error.message };
    written += rest.length;
  }
  return { written };
}

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
      /*
        An imported sales order with no status contributes ZERO revenue, because
        metrics.ts only counts status === "won". The manual "Add sales order"
        form defaults to "won"; the importer did not, so importing 500 orders
        produced "Orders (MTD): 500" beside "Revenue (MTD): \u20b90" and nothing
        anywhere explained why. The two paths now agree.
      */
      if (table === "sales_orders" && !o.status) o.status = "won";
      return o;
    });
    const sb = createClient();
    const wrote = await writeImported(sb, table, mapped);
    if (wrote.error) {
      return {
        inserted: wrote.written,
        error: wrote.written
          ? `${wrote.error} (${wrote.written} row${wrote.written === 1 ? "" : "s"} were saved before this)`
          : wrote.error,
      };
    }
    await recomputeQuietly(orgId);
    await logActivity(orgId, "import", `Imported ${wrote.written} rows into ${table} (CSV)`);
    ["/sales", "/finance", "/inventory", "/hr", "/dashboard"].forEach((p) => revalidatePath(p));
    return { inserted: wrote.written };
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
    const wrote = await writeImported(sb, table, mapped);
    if (wrote.error) {
      return {
        inserted: wrote.written,
        error: wrote.written
          ? `${wrote.error} (${wrote.written} row${wrote.written === 1 ? "" : "s"} were saved before this)`
          : wrote.error,
      };
    }
    await recomputeQuietly(orgId);
    await logActivity(orgId, "import", `Imported ${wrote.written} rows into ${table} (URL)`);
    ["/sales", "/finance", "/inventory", "/hr", "/dashboard", "/data"].forEach((p) => revalidatePath(p));
    return { inserted: wrote.written };
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

// ---- Production ----
/**
 * Log a shift. `production_runs` has existed since the first schema and nothing
 * ever wrote to it, so the Production page had no choice but to show literals.
 *
 * OEE is computed when the operator leaves it blank, because most shop floors
 * track quantities and downtime but not the composite — and an OEE they had to
 * calculate by hand is an OEE that will be left empty.
 */
export async function addProductionRun(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();

  const planned = num(fd.get("planned_qty"));
  const actual = num(fd.get("actual_qty"));
  const reject = num(fd.get("reject_qty"));
  const downtime = num(fd.get("downtime_min"));
  const givenOee = str(fd.get("oee"));

  // Availability × Performance × Quality, over a nominal 8-hour shift.
  // Only computed when the inputs genuinely support it — a guessed OEE is
  // worse than a blank one, because it will be trended.
  let oee: number | null = givenOee ? num(fd.get("oee")) : null;
  if (oee === null && planned > 0 && actual >= 0) {
    const shiftMin = 480;
    const availability = Math.max(0, Math.min(1, (shiftMin - downtime) / shiftMin));
    const performance = Math.max(0, Math.min(1, actual / planned));
    const quality = actual + reject > 0 ? actual / (actual + reject) : 1;
    oee = +(availability * performance * quality * 100).toFixed(1);
  }

  const { error } = await sb.from("production_runs").insert({
    org_id: orgId,
    machine: str(fd.get("machine")),
    shift: str(fd.get("shift")) || null,
    run_date: str(fd.get("run_date")) || new Date().toISOString().slice(0, 10),
    planned_qty: planned, actual_qty: actual, reject_qty: reject,
    downtime_min: downtime,
    oee,
  });
  if (error) throw new Error(error.message);
  await logActivity(orgId, "crud", `Logged production run on ${str(fd.get("machine"))}`);
  await recomputeQuietly(orgId);
  revalidatePath("/production");
  revalidatePath("/dashboard");
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
  // /usage counts customers, and the AI's memory reads them.
  revalidatePath("/usage");
}

// ---- Team invites ----
export async function inviteMember(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const { user } = await getUserAndOrg();
  const email = str(fd.get("email")); const role = str(fd.get("role")) || "analyst";
  if (!email) throw new Error("Email required");
  const sb = createClient();
  const org = await sb.from("organizations").select("name, plan").eq("id", orgId).single();
  const orgName = (org.data as any)?.name || "our company";

  // Seat limit. Every plan advertises a user cap and none was enforced, so a
  // ₹799 Solo workspace could add unlimited teammates. Pending invites count,
  // otherwise the cap is trivially bypassed by inviting everyone at once.
  const cap = seatLimit((org.data as any)?.plan);
  if (cap > 0) {
    const [{ count: members }, { count: pending }] = await Promise.all([
      sb.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      sb.from("invites").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
    ]);
    const used = (members || 0) + (pending || 0);
    if (used >= cap) {
      throw new Error(`Your plan includes ${cap} user${cap === 1 ? "" : "s"} and you've used ${used}. Upgrade under Billing to add more.`);
    }
  }

  // Don't stack duplicate invites for the same address.
  const { data: dupe } = await sb.from("invites").select("id").eq("org_id", orgId).ilike("email", email).eq("status", "pending").limit(1);
  if (dupe && dupe.length) throw new Error(`${email} already has a pending invite.`);
  const { error } = await sb.from("invites").insert({ org_id: orgId, email: email.toLowerCase(), role });
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
  const id = str(fd.get("id"));
  const stage = str(fd.get("stage"));

  const { data: before } = await sb.from("sales_pipeline").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();

  const { error } = await sb.from("sales_pipeline").update({ stage }).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);

  /*
    Winning a deal used to change one word in one table and nothing else. The
    pipeline showed a weighted forecast in crores that never reached revenue,
    the dashboard, the AI's context or any report — so a founder could close
    their biggest deal of the year and watch the dashboard not move.

    A won deal now becomes a sales order, which is what every KPI is actually
    computed from. Guarded against double-writing when a deal is dragged back
    and forth across the "won" column.
  */
  if (before && stage.toLowerCase() === "won" && String(before.stage || "").toLowerCase() !== "won") {
    // Both of these used to discard their error. On a database where the
    // migration had not run yet, the select failed, `existing` came back
    // undefined, the insert ran, the insert failed — and the whole
    // won-deal-becomes-revenue feature was a silent no-op with nothing in the
    // logs. A feature that quietly does nothing is worse than one that breaks.
    const { data: existing, error: lookupErr } = await sb.from("sales_orders")
      .select("id").eq("org_id", orgId).eq("source_deal_id", id).limit(1);
    if (lookupErr) throw new Error(`Deal moved, but the sales order could not be checked: ${lookupErr.message}`);
    if (!existing?.length) {
      const { error: soErr } = await sb.from("sales_orders").insert({
        org_id: orgId,
        order_no: "SO-" + seqSuffix(),
        customer_name: before.customer_name || before.deal_name || "Won deal",
        product: before.deal_name || null,
        amount: Number(before.value || 0),
        status: "won",
        order_date: new Date().toISOString().slice(0, 10),
        source_deal_id: id,
        // Winning a DEMO deal must not leave a permanent real order behind
        // that "Remove sample data" cannot clear.
        is_demo: Boolean(before.is_demo),
      });
      if (soErr) throw new Error(`Deal moved to won, but the sales order could not be created: ${soErr.message}`);
      await logActivity(orgId, "crud", `Deal won — created a sales order for ${before.customer_name || before.deal_name || "the deal"}`);
    }
    await recomputeQuietly(orgId);
    revalidatePath("/dashboard");
    revalidatePath("/sales");
    revalidatePath("/finance");
  } else if (before && String(before.stage || "").toLowerCase() === "won" && stage.toLowerCase() !== "won") {
    // Dragged back OUT of won. Without this the sales order stayed "won" for
    // ever, so the pipeline and the revenue figure permanently disagreed and
    // nothing recomputed to reveal it.
    await sb.from("sales_orders").update({ status: "open" }).eq("org_id", orgId).eq("source_deal_id", id);
    await recomputeQuietly(orgId);
    revalidatePath("/dashboard");
    revalidatePath("/sales");
    revalidatePath("/finance");
  }
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
  ["/autopilot", "/dashboard", "/activity", "/alerts"].forEach((p) => revalidatePath(p));
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


// ---- Outbound webhooks ------------------------------------------------------

export async function addWebhook(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const url = str(fd.get("url"));
  if (!/^https:\/\/.+/i.test(url)) throw new Error("Enter an https:// URL — plain http isn't accepted for webhooks.");
  const label = str(fd.get("label"));
  const events = str(fd.get("events")).split(",").map((e) => e.trim()).filter(Boolean);

  const { newSecret } = await import("@/lib/webhooks");
  const svc = serviceClient();
  if (!svc) throw new Error("Service role not configured.");
  const { error } = await svc.from("webhook_endpoints").insert({
    org_id: orgId, url, label: label || null, events, secret: newSecret(),
  });
  if (error) throw new Error(error.message);
  await logActivity(orgId, "crud", `Added webhook endpoint ${url}`);
  revalidatePath("/developers");
}

export async function deleteWebhook(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const svc = serviceClient();
  if (!svc) throw new Error("Service role not configured.");
  await svc.from("webhook_endpoints").delete().eq("id", str(fd.get("id"))).eq("org_id", orgId);
  revalidatePath("/developers");
}

/** Send a signed test event so the receiver can be verified before going live. */
export async function testWebhook(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const { emit } = await import("@/lib/webhooks");
  await emit(orgId, "report.generated", { test: true, message: "Test event from MNB Cortex" });
  revalidatePath("/developers");
}

// ---- Scheduled reports ------------------------------------------------------

export async function addScheduledReport(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const svc = serviceClient();
  if (!svc) throw new Error("Service role not configured.");
  const mode = str(fd.get("mode")) || "brief";
  const cadence = str(fd.get("cadence")) || "weekly";
  if (!["daily", "weekly", "monthly"].includes(cadence)) throw new Error("Cadence must be daily, weekly or monthly.");
  const sendTo = str(fd.get("send_to"));
  const { error } = await svc.from("scheduled_reports").insert({
    org_id: orgId, mode, cadence, send_to: sendTo || null,
  });
  if (error) throw new Error(error.message);
  await logActivity(orgId, "crud", `Scheduled a ${cadence} ${mode} report`);
  revalidatePath("/reports");
}

export async function deleteScheduledReport(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const svc = serviceClient();
  if (!svc) throw new Error("Service role not configured.");
  await svc.from("scheduled_reports").delete().eq("id", str(fd.get("id"))).eq("org_id", orgId);
  revalidatePath("/reports");
}


/** Pull data from a connected integration right now. */
export async function syncIntegration(fd: FormData) {
  const { orgId } = await requireRole("admin");
  const provider = str(fd.get("provider"));
  const { syncProvider } = await import("@/lib/sync");
  const r = await syncProvider(orgId, provider);
  if (!r.ok) throw new Error(r.error || `Could not sync ${provider}.`);
  await logActivity(orgId, "integration",
    `Synced ${provider} — ${r.salesOrders} orders, ${r.invoices} invoices, ${r.customers} customers`);
  ["/integrations", "/dashboard", "/sales", "/finance"].forEach((p) => revalidatePath(p));
}

// ---- KPI alert rules ----
/**
 * Rules used to live in localStorage. That meant they vanished on another
 * device, were invisible to teammates, and — the part that made the feature a
 * fiction — were never evaluated anywhere except inside the open browser tab
 * that happened to hold them. No alert could ever fire.
 *
 * They now live with the workspace and are evaluated in recomputeMetrics, which
 * already runs after every write.
 */
export async function saveAlertRule(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const metric_key = str(fd.get("metric_key"));
  const op = str(fd.get("op")) === ">" ? ">" : "<";
  const threshold = num(fd.get("threshold"));
  if (!metric_key) throw new Error("Pick which number to watch.");

  const { error } = await sb.from("alert_rules")
    .upsert({ org_id: orgId, metric_key, op, threshold, enabled: true }, { onConflict: "org_id,metric_key,op" });
  if (error) throw new Error(error.message);

  // Evaluate immediately, so saving a rule that is ALREADY breached warns you
  // now rather than the next time something else happens to be saved.
  await recomputeQuietly(orgId);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function deleteAlertRule(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const id = str(fd.get("id"));
  const { error } = await sb.from("alert_rules").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  // Close anything that rule had opened — a deleted rule must not leave a
  // warning behind that nothing can ever clear.
  try { await sb.from("alerts").update({ is_read: true }).eq("org_id", orgId).eq("rule_id", id); } catch { /* best effort */ }
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function dismissAlert(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  // dismissed_at, not just is_read. recomputeMetrics uses is_read to mean "the
  // rule recovered"; if a dismissal looked the same, the next save would raise
  // the alert again and the button would appear broken.
  const { error } = await sb.from("alerts")
    .update({ is_read: true, dismissed_at: new Date().toISOString() })
    .eq("id", str(fd.get("id"))).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}
