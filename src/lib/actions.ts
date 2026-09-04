"use server";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg, getBusinessContext } from "@/lib/data";
import { seatLimit, planIncludes, lowestPlanWith } from "@/lib/config";
import { SUPER_ADMINS } from "@/lib/operators";
import { generateFor } from "@/lib/ai/cortex";
import { sendEmail } from "@/lib/email";
import { recomputeQuietly } from "@/lib/metrics";
import { resolveHeaders, applyMapping } from "@/lib/import-map";
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

/** Tables the demo seeder writes into, in child-before-parent order.
 *  `customers` is listed AFTER sales_orders on purpose: orders carry a
 *  customer_id foreign key, so the children go first. */
const DEMO_TABLES = [
  "health_metrics", "ai_insights", "alerts", "finance_ledger",
  "sales_orders", "customers", "sales_pipeline", "production_runs", "inventory_items",
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

  /*
    The sample orders name six buyers who did not exist as contacts, so
    /customers, /rfm and /churn all stayed empty behind a button promising to
    "fill every module". seed_demo_customers adds them.

    Called as a companion rather than folded into seed_demo_data because that
    function is ~150 lines in supabase/seed.sql, and copying it into a migration
    to add ten lines would leave two definitions to drift apart — the exact
    problem that already required a parity test for cortex_norm_name.

    Ordered AFTER the orders exist so the customers_adopt_orders trigger links
    the sample history on insert.

    A missing function is tolerated: a workspace that has not run
    2026_seed_demo_customers.sql yet should still get the rest of the sample
    data rather than an error, exactly as before this shipped.
  */
  const { error: custErr } = await sb.rpc("seed_demo_customers", { p_org: orgId });
  if (custErr && !/could not find the function|does not exist/i.test(custErr.message || "")) {
    throw new Error(custErr.message);
  }
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
    .or("status.is.null,status.not.ilike.paid").limit(500);
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
  invoices: { cols: ["invoice_no", "party", "amount", "issue_date", "due_date", "status", "type"], nums: ["amount"] },
  inventory_items: { cols: ["sku", "name", "category", "on_hand", "reorder_level", "unit_cost", "supplier"], nums: ["on_hand", "reorder_level", "unit_cost"] },
  employees: { cols: ["name", "department", "role", "monthly_ctc", "performance"], nums: ["monthly_ctc", "performance"] },
  // Leads were not importable, and no code path could create one belonging to a
  // customer's workspace at all — so /leads was permanently empty for every
  // paying customer while telling them to "share your pricing page".
  leads: { cols: ["name", "email", "phone", "plan", "source"], nums: [] },
  production_runs: { cols: ["machine", "shift", "run_date", "planned_qty", "actual_qty", "reject_qty", "downtime_min", "oee"], nums: ["planned_qty", "actual_qty", "reject_qty", "downtime_min", "oee"] },
  customers: { cols: ["name", "company", "email", "phone", "status", "value"], nums: ["value"] },
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

export async function importRows(fd: FormData): Promise<{
  inserted: number; error?: string;
  matched?: number; totalCols?: number; missing?: string[];
}> {
  try {
    const orgId = await requireWriteOrg();
    const table = str(fd.get("table"));
    const spec = IMPORT_COLS[table];
    if (!spec) return { inserted: 0, error: "Unsupported dataset" };
    let rows: any[] = [];
    try { rows = JSON.parse(str(fd.get("rows"))); } catch { return { inserted: 0, error: "Invalid data" }; }
    if (!Array.isArray(rows) || !rows.length) return { inserted: 0, error: "No rows to import" };

    /*
      Resolve the customer's headers to our columns BEFORE mapping anything.

      This used to read `r[c]` verbatim, so a file headed "Order No" / "Customer"
      / "Amount" matched nothing, inserted blank rows, and reported success. That
      is what most real exports look like — Tally, Vyapar, Busy, or a shop's own
      Excel — so the primary onboarding action failed silently for almost
      everyone, and the owner's fair conclusion was that the product was broken.

      Refusing loudly is the other half of the fix: if we recognise nothing, say
      so and import NOTHING, rather than writing empty records.
    */
    const headers = Object.keys(rows[0] || {});
    const match = resolveHeaders(table, headers);
    if (match.matched === 0) {
      return {
        inserted: 0,
        error: `None of your columns were recognised (found: ${headers.slice(0, 6).join(", ")}${headers.length > 6 ? "…" : ""}). `
          + `Expected something like: ${spec.cols.slice(0, 4).join(", ")}.`,
      };
    }

    const mapped = rows.slice(0, 1000).map((r) => {
      const o: any = { org_id: orgId };
      const picked = applyMapping(r, match);
      for (const c of spec.cols) {
        const v = picked[c];
        if (v === undefined || v === "") continue;
        o[c] = spec.nums.includes(c) ? (parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0) : String(v);
      }
      /*
        An imported sales order with no status contributes ZERO revenue, because
        metrics.ts only counts status === "won". The manual "Add sales order"
        form defaults to "won"; the importer did not, so importing 500 orders
        produced "Orders (MTD): 500" beside "Revenue (MTD): \u20b90" and nothing
        anywhere explained why. The two paths now agree.
      */
      if (table === "sales_orders" && !o.status) o.status = "won";

      /*
        Normalise the two columns that are COMPARED rather than displayed.

        Every read in this codebase tests `status <> 'paid'` and
        `type = 'receivable'` case-sensitively. A Tally or Vyapar export writes
        "Paid", "PAID" or "Receivable", so an invoice the customer has already
        settled came through as unpaid — and would then have been CHASED by the
        collections agent, which is the worst outcome this product can produce.
        It also inflated the 43B(h) tax exposure with bills that were paid.

        Normalised at the point of writing rather than at every read, because
        there are a dozen reads and one importer.
      */
      if (table === "invoices") {
        if (o.status) o.status = String(o.status).trim().toLowerCase();
        if (o.type) o.type = String(o.type).trim().toLowerCase();
        // Anything that is not a known receivable/payable value is a receivable,
        // which is the existing column default.
        if (o.type && !["receivable", "payable"].includes(o.type)) o.type = "receivable";
      }
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
    return {
      inserted: wrote.written,
      // Surfaced so a PARTIAL match is visible. Importing 500 rows while
      // silently dropping the amount column is the failure that looks like
      // success, and it is the one worth telling the user about.
      matched: match.matched,
      totalCols: match.total,
      missing: match.missing,
    };
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

  /*
    ENTITLEMENT. "Public API + outbound webhooks" is a Watch Pro bullet at
    ₹14,999 and nothing checked the plan, so a ₹4,999 Watch workspace could
    issue keys. Gating CREATION only is deliberate: a key issued under an older
    or higher plan keeps working, because cutting off a running integration to
    enforce a price is the kind of correctness that loses customers.
  */
  const { data: org } = await sb.from("organizations").select("plan").eq("id", orgId).single();
  const plan = String((org as any)?.plan || "");
  if (!planIncludes(plan, "api")) {
    throw new Error(
      `The public API is part of ${lowestPlanWith("api")} and above. Your existing keys keep working — ` +
      `upgrade under Billing to issue new ones.`,
    );
  }

  /*
    crypto.randomUUID, not Math.random.

    Math.random is a fast non-cryptographic PRNG with observable internal state:
    given a few outputs from the same process, the rest of the sequence is
    recoverable. Three concatenated calls plus a timestamp is therefore a
    GUESSABLE API key — and this key authenticates full read access to a
    workspace's financial data. Two UUIDv4s give 244 bits from the platform CSPRNG.
  */
  const { randomUUID } = await import("node:crypto");
  const key = "mnb_" + (randomUUID() + randomUUID()).replace(/-/g, "");

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
  /*
    This token is the ONLY thing protecting the link.

    A report link is a public URL — no session, no login — that renders the
    workspace's revenue, cash position and customer list to anyone who has it.
    The token was two concatenated Math.random() calls, which is roughly 100
    bits of a NON-cryptographic PRNG whose internal state is recoverable from a
    handful of outputs. Anyone who created two report links of their own could
    work out the generator's state and derive other tenants' tokens, and the
    result is one customer reading another customer's finances over the open
    internet.

    randomUUID draws from the platform CSPRNG. Two of them is 244 bits with no
    recoverable state.
  */
  const { randomUUID } = await import("node:crypto");
  const token = "r_" + (randomUUID() + randomUUID()).replace(/-/g, "");
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

// ---- Leads ----
/**
 * Add a lead to THIS workspace.
 *
 * The three existing lead writers are MNB's own marketing forms and correctly
 * insert with org_id = null, so the platform console can see them and tenants
 * cannot. That left customers with a Leads module nothing could ever fill.
 */
export async function addLead(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const name = str(fd.get("name"));
  const email = str(fd.get("email"));
  if (!name && !email) throw new Error("A lead needs at least a name or an email address.");
  const { error } = await sb.from("leads").insert({
    org_id: orgId,
    name: name || null,
    email: email || null,
    phone: str(fd.get("phone")) || null,
    plan: str(fd.get("plan")) || null,
    source: str(fd.get("source")) || "manual",
  });
  if (error) throw new Error(error.message);
  await logActivity(orgId, "crud", `Added lead ${name || email}`);
  revalidatePath("/leads");
}

/**
 * Turn a lead into a customer, keeping the lead as the record of where they
 * came from. There was no path between the two tables at all — `customers`
 * even has a "lead" status that had no relationship to the `leads` table.
 */
export async function convertLead(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const id = str(fd.get("id"));

  const { data: lead, error: readErr } = await sb.from("leads")
    .select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!lead) throw new Error("That lead no longer exists.");

  const { error } = await sb.from("customers").insert({
    org_id: orgId,
    name: (lead as any).name || (lead as any).email || "Unnamed",
    email: (lead as any).email || null,
    phone: (lead as any).phone || null,
    status: "active",
    value: 0,
  });
  if (error) throw new Error(error.message);

  await sb.from("leads").update({ source: `${(lead as any).source || "lead"} · converted` }).eq("id", id).eq("org_id", orgId);
  await logActivity(orgId, "crud", `Converted lead ${(lead as any).name || (lead as any).email} to a customer`);
  await recomputeQuietly(orgId);
  revalidatePath("/leads");
  revalidatePath("/customers");
}

// ---- Goals / OKRs ----
export async function saveGoal(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const name = str(fd.get("name"));
  if (!name) throw new Error("Give the goal a name.");
  const metricKey = str(fd.get("metric_key"));
  const { error } = await sb.from("goals").insert({
    org_id: orgId,
    name,
    // Empty means "I'll track this myself" — a legitimate choice, and the only
    // case where current_val is stored rather than derived.
    metric_key: metricKey || null,
    current_val: metricKey ? 0 : num(fd.get("current_val")),
    target_val: num(fd.get("target_val")),
    unit: str(fd.get("unit")) || "",
    lower_is_better: str(fd.get("lower_is_better")) === "1",
  });
  if (error) throw new Error(error.message);
  await logActivity(orgId, "crud", `Set a goal: ${name}`);
  revalidatePath("/goals");
}

export async function deleteGoal(fd: FormData) {
  // Deletes need manager+ at the database layer; gating lower would silently
  // remove zero rows and report success.
  const { orgId } = await requireRole("manager"); const sb = createClient();
  const { error } = await sb.from("goals").delete().eq("id", str(fd.get("id"))).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/goals");
}

// ---- Collections -------------------------------------------------------------
/*
  The chase loop, from the owner's side.

  Approval is a real step, not a formality: `approveMessage` is the only path
  from `draft` to `approved`, and lib/collections only ever sends `approved`.
  That is what makes it safe to let Cortex write in someone's name.
*/

export async function saveCollectionPolicy(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  let orgId: string;
  try { orgId = (await requireRole("admin")).orgId; }
  catch { return { ok: false, error: "Only an admin can change collections settings." }; }

  const clamp = (v: any, lo: number, hi: number, dflt: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
  };
  const tone = str(fd.get("tone"));
  const channels = String(fd.get("channels") || "email").split(",").map((c) => c.trim()).filter((c) => c === "email" || c === "whatsapp");

  /*
    The WhatsApp template name is lowercased and stripped before it is stored.

    Meta only accepts lowercase letters, digits and underscores, and the most
    likely way for someone to get this wrong is pasting "Payment Reminder" as it
    is displayed in WhatsApp Manager rather than as the name Meta assigned. A
    silent send failure two days later is a much worse teacher than fixing the
    obvious case here — and anything still invalid after this is rejected with a
    sentence, below, rather than stored to fail at send time.
  */
  const waTemplate = str(fd.get("whatsapp_template")).trim().toLowerCase().replace(/\s+/g, "_") || null;
  if (waTemplate && !/^[a-z0-9_]{1,512}$/.test(waTemplate)) {
    return {
      ok: false,
      error: `"${waTemplate}" is not a valid WhatsApp template name. Meta allows only lowercase letters, numbers and underscores — copy it exactly as it appears in WhatsApp Manager.`,
    };
  }
  const waLang = str(fd.get("whatsapp_lang")).trim().replace(/[^A-Za-z_]/g, "").slice(0, 10) || "en";

  /*
    Refuse to enable a channel that cannot send. Turning WhatsApp on without a
    template produces a policy whose every WhatsApp reminder is skipped, and the
    owner finds out from an empty outbox rather than from this form.
  */
  if (channels.includes("whatsapp") && !waTemplate) {
    return {
      ok: false,
      error: "WhatsApp reminders need the name of a message template you have had approved by Meta. " +
             "WhatsApp does not allow a business to message someone who has not messaged them first " +
             "without one, and a customer you are chasing has not. Add the template name, or leave " +
             "WhatsApp switched off and send by email.",
    };
  }

  /*
    Validated here as well as by the CHECK constraints. A bad value should be a
    clear message, not a database error surfaced to someone changing a setting.
  */
  const patch = {
    org_id: orgId,
    enabled: str(fd.get("enabled")) === "1",
    auto_send: str(fd.get("auto_send")) === "1",
    tone: ["polite", "neutral", "firm"].includes(tone) ? tone : "polite",
    channels: channels.length ? channels : ["email"],
    first_after_days: clamp(fd.get("first_after_days"), 0, 90, 3),
    min_gap_days: clamp(fd.get("min_gap_days"), 1, 90, 7),
    max_attempts: clamp(fd.get("max_attempts"), 1, 10, 3),
    max_per_day: clamp(fd.get("max_per_day"), 1, 200, 25),
    send_from_hour: clamp(fd.get("send_from_hour"), 0, 23, 9),
    send_to_hour: clamp(fd.get("send_to_hour"), 0, 23, 19),
    do_not_contact: String(fd.get("do_not_contact") || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 500),
    signature: str(fd.get("signature")) || null,
    payment_note: str(fd.get("payment_note")) || null,
    whatsapp_template: waTemplate,
    whatsapp_lang: waLang,
    updated_at: new Date().toISOString(),
  };

  const sb = createClient();
  const { error } = await sb.from("collection_policies").upsert(patch, { onConflict: "org_id" });
  if (error) return { ok: false, error: error.message };
  await logActivity(orgId, "crud", `Updated collections settings (${patch.enabled ? "on" : "off"})`);
  revalidatePath("/collections");
  return { ok: true };
}

/** Draft the next reminder for everything that qualifies. Sends nothing. */
export async function prepareCollectionDrafts(): Promise<{ ok: boolean; drafted?: number; skipped?: number; reasons?: Record<string, number>; error?: string }> {
  let orgId: string;
  try { orgId = await requireWriteOrg(); }
  catch { return { ok: false, error: "Sign in to run collections." }; }
  try {
    const { prepareDrafts } = await import("@/lib/collections");
    const { getOrgProfile } = await import("@/lib/data");
    const profile: any = await getOrgProfile().catch(() => null);
    const res = await prepareDrafts(orgId, profile?.name || "our company");
    revalidatePath("/collections");
    return { ok: true, ...res };
  } catch (e: any) { return { ok: false, error: e?.message || "Could not prepare drafts." }; }
}

export async function approveMessage(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  let orgId: string;
  try { orgId = await requireWriteOrg(); }
  catch { return { ok: false, error: "Sign in to approve." }; }
  const id = str(fd.get("id"));
  const sb = createClient();
  /*
    Only a DRAFT may be approved. Without the status filter, re-submitting this
    form would reset a message that had already been sent back to approved, and
    the next run would send it again.
  */
  const { error } = await sb.from("collection_messages")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", orgId).eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/collections");
  return { ok: true };
}

export async function cancelMessage(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  let orgId: string;
  try { orgId = await requireWriteOrg(); }
  catch { return { ok: false, error: "Sign in." }; }
  const sb = createClient();
  const { error } = await sb.from("collection_messages")
    .update({ status: "cancelled" })
    .eq("id", str(fd.get("id"))).eq("org_id", orgId).in("status", ["draft", "approved"]);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/collections");
  return { ok: true };
}

/** Send everything approved, now, rather than waiting for the daily run. */
export async function sendApprovedNow(): Promise<{ ok: boolean; sent?: number; failed?: number; note?: string; error?: string }> {
  let orgId: string;
  try { orgId = await requireWriteOrg(); }
  catch { return { ok: false, error: "Sign in." }; }
  try {
    const { sendApproved } = await import("@/lib/collections");
    const res = await sendApproved(orgId);
    revalidatePath("/collections");
    return { ok: true, ...res };
  } catch (e: any) { return { ok: false, error: e?.message || "Could not send." }; }
}

/** Never chase this invoice again. */
export async function excludeFromCollections(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  let orgId: string;
  try { orgId = await requireWriteOrg(); }
  catch { return { ok: false, error: "Sign in." }; }
  const invoiceId = str(fd.get("invoice_id"));
  const sb = createClient();

  /*
    Verify the invoice belongs to THIS workspace before writing a row about it.

    org_id came from the session, so the row itself was always correctly scoped
    — but invoice_id came from the form and was never checked. Posting another
    tenant's invoice id created a collection_threads row in YOUR workspace
    pointing at THEIR invoice, and every join from that thread back to invoices
    then leaked their party name and amount onto your screen.

    The read below is RLS-scoped (createClient, not the service role), so a
    foreign id simply returns nothing and the request is refused. Cheap, and it
    closes the hole rather than relying on the FK, which enforces existence but
    says nothing about ownership.
  */
  if (!invoiceId) return { ok: false, error: "No invoice specified." };
  const { data: inv } = await sb.from("invoices")
    .select("id, party, amount").eq("id", invoiceId).eq("org_id", orgId).maybeSingle();
  if (!inv) return { ok: false, error: "That invoice is not in this workspace." };

  /*
    Party and amount are taken from the INVOICE, not from the form. They were
    read straight off the request, so the thread could be labelled with any name
    and value the caller chose — and that thread feeds the recovery ledger,
    which is the number we show a customer to prove Cortex earned its fee.
  */
  const { error } = await sb.from("collection_threads").upsert({
    org_id: orgId, invoice_id: invoiceId,
    party: String((inv as any).party || "Unknown"),
    amount: Number((inv as any).amount) || 0,
    status: "excluded",
  }, { onConflict: "org_id,invoice_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/collections");
  return { ok: true };
}

// ---- Suppliers / MSME classification ----------------------------------------
/*
  Set one supplier's Udyam category.

  This is the input to the 43B(h) exposure figure, and the reason that figure
  can be honest: micro and small are covered by the section, medium and
  unregistered are not, and none of it is derivable from any other data in the
  workspace. The value is validated against the same list the CHECK constraint
  allows, so a bad value is refused here rather than becoming a database error
  in the user's face.
*/
const UDYAM = new Set(["micro", "small", "medium", "not_registered"]);

export async function setVendorUdyam(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  let orgId: string;
  try { orgId = await requireWriteOrg(); }
  catch { return { ok: false, error: "Sign in to classify suppliers." }; }

  const id = str(fd.get("id"));
  const category = str(fd.get("udyam_category"));
  if (!id) return { ok: false, error: "No supplier." };
  if (!UDYAM.has(category)) return { ok: false, error: "Unknown category." };

  const sb = createClient();
  const { error } = await sb.from("vendors")
    .update({ udyam_category: category })
    .eq("id", id).eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/msme");
  revalidatePath("/vendors");
  return { ok: true };
}

// ---- Invoices & quotes ------------------------------------------------------
/*
  These used to be printouts. The generator and the quote builder were React
  state plus window.print(), so an invoice existed only until the tab closed —
  while receivables ageing, DSO, the cash conversion cycle, 13-week cash, the
  collections chase and global search all read the `invoices` table and sat
  empty for anyone billing through Cortex's own tool.

  Saving is an UPSERT on (org_id, invoice_no), which already carries a unique
  index. That is deliberate: pressing Save twice, or a double-submit on a slow
  connection, must not create two receivables for one bill. Getting this wrong
  overstates money owed, which is worse than losing the invoice.
*/

export type InvoiceDoc = {
  invoice_no: string;
  party: string;
  amount: number;
  issue_date?: string | null;
  due_date?: string | null;
  status?: string;
  meta?: any;
};

export type SavedInvoice = {
  id: string; invoice_no: string | null; party: string | null;
  amount: number; issue_date: string | null; due_date: string | null;
  status: string | null; meta: any;
};

/** Statuses the invoices table understands. Anything else is coerced. */
const INVOICE_STATUS = new Set(["pending", "paid", "overdue"]);

export async function saveInvoice(doc: InvoiceDoc): Promise<{ ok: boolean; error?: string }> {
  let orgId: string;
  try { orgId = await requireWriteOrg(); }
  catch { return { ok: false, error: "Sign in to save this invoice." }; }

  const invoice_no = String(doc.invoice_no || "").trim().slice(0, 60);
  const party = String(doc.party || "").trim().slice(0, 160);
  const amount = Number(doc.amount) || 0;

  // Validated here rather than trusted from the client: this row becomes a
  // number in the customer's receivables.
  if (!invoice_no) return { ok: false, error: "Give the invoice a number before saving." };
  if (!party) return { ok: false, error: "Add the customer's name before saving." };
  if (!(amount > 0)) return { ok: false, error: "The invoice total must be more than zero." };

  const sb = createClient();
  const { error } = await sb.from("invoices").upsert({
    org_id: orgId,
    invoice_no,
    party,
    amount,
    issue_date: doc.issue_date || null,
    due_date: doc.due_date || null,
    status: INVOICE_STATUS.has(String(doc.status)) ? doc.status : "pending",
    type: "receivable",
    meta: doc.meta ?? null,
  }, { onConflict: "org_id,invoice_no" });

  if (error) {
    /*
      A missing `meta` column means this workspace's database has not had
      2026_invoice_documents applied. Retry without it rather than refusing to
      save: losing the reprintable copy is a far smaller harm than telling a
      customer their invoice could not be saved at all.
    */
    const missingColumn = error.code === "PGRST204" || error.code === "42703"
      || /column .* does not exist/i.test(error.message || "");
    if (!missingColumn) return { ok: false, error: error.message };

    const retry = await sb.from("invoices").upsert({
      org_id: orgId, invoice_no, party, amount,
      due_date: doc.due_date || null,
      status: INVOICE_STATUS.has(String(doc.status)) ? doc.status : "pending",
      type: "receivable",
    }, { onConflict: "org_id,invoice_no" });
    if (retry.error) return { ok: false, error: retry.error.message };
  }

  // The whole point of saving: the numbers that read this table must move.
  await recomputeQuietly(orgId);
  await logActivity(orgId, "crud", `Saved invoice ${invoice_no} for ${party}`);
  for (const p of ["/invoice", "/receivables", "/cash13", "/ccc", "/data"]) revalidatePath(p);
  return { ok: true };
}

export async function listInvoices(): Promise<SavedInvoice[]> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return [];
  const sb = createClient();
  try {
    const { data } = await sb.from("invoices")
      .select("id,invoice_no,party,amount,issue_date,due_date,status,meta")
      .eq("org_id", orgId).eq("type", "receivable")
      .order("created_at", { ascending: false }).limit(50);
    return (data as any[] || []).map((r) => ({ ...r, amount: Number(r.amount) || 0 }));
  } catch {
    // Column not migrated yet — fall back to what definitely exists.
    try {
      const { data } = await sb.from("invoices")
        .select("id,invoice_no,party,amount,due_date,status")
        .eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
      return (data as any[] || []).map((r) => ({ ...r, amount: Number(r.amount) || 0, issue_date: null, meta: null }));
    } catch { return []; }
  }
}

export async function saveQuote(doc: {
  quote_no: string; party: string; amount: number; valid_until?: string | null; meta?: any;
}): Promise<{ ok: boolean; error?: string }> {
  let orgId: string;
  try { orgId = await requireWriteOrg(); }
  catch { return { ok: false, error: "Sign in to save this quote." }; }

  const quote_no = String(doc.quote_no || "").trim().slice(0, 60);
  const party = String(doc.party || "").trim().slice(0, 160);
  const amount = Number(doc.amount) || 0;
  if (!quote_no) return { ok: false, error: "Give the quote a number before saving." };
  if (!party) return { ok: false, error: "Add the customer's name before saving." };

  const sb = createClient();
  const { error } = await sb.from("quotes").upsert({
    org_id: orgId, quote_no, party, amount,
    valid_until: doc.valid_until || null,
    meta: doc.meta ?? null,
  }, { onConflict: "org_id,quote_no" });
  if (error) return { ok: false, error: error.message };

  /*
    Note what is NOT done here: no recompute, and nothing written to `invoices`.
    A quote is not money owed. Counting one as a receivable is how a pipeline
    number ends up inside a cash forecast, which is the kind of error an owner
    only discovers when the cash does not arrive.
  */
  await logActivity(orgId, "crud", `Saved quote ${quote_no} for ${party}`);
  revalidatePath("/quote");
  return { ok: true };
}

export async function listQuotes(): Promise<any[]> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return [];
  const sb = createClient();
  try {
    const { data } = await sb.from("quotes")
      .select("id,quote_no,party,amount,valid_until,status,created_at")
      .eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
    return (data as any[]) || [];
  } catch { return []; }
}

// ---- Action board -----------------------------------------------------------
/*
  These used to live in localStorage, which meant the owner's task list was
  empty on his phone and invisible to his team. Same fix, and the same reasoning,
  as the alert rules immediately below.

  Returned as plain objects rather than a page query so the board can be used
  from anywhere; every one of these is org-scoped by RLS as well as by the
  explicit .eq("org_id"), because relying on only one of the two is how a
  tenancy bug gets in.
*/
export type ActionTask = {
  id: string; title: string; col: 0 | 1 | 2;
  priority?: "P1" | "P2" | "P3" | null; source: string;
};

export async function listTasks(): Promise<ActionTask[]> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return [];
  const sb = createClient();
  try {
    const { data } = await sb.from("action_tasks")
      .select("id,title,col,priority,source")
      .eq("org_id", orgId).order("created_at", { ascending: true }).limit(300);
    return (data as any[] || []).map((t) => ({ ...t, col: Number(t.col) as 0 | 1 | 2 }));
  } catch { return []; }   // table not migrated yet — board still renders
}

export async function addTask(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const title = str(fd.get("title")).slice(0, 200);
  if (!title) return;
  const priority = str(fd.get("priority"));
  const { error } = await sb.from("action_tasks").insert({
    org_id: orgId,
    title,
    col: 0,
    priority: ["P1", "P2", "P3"].includes(priority) ? priority : null,
    source: str(fd.get("source")) === "ai" ? "ai" : "user",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/action-center");
}

export async function moveTask(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const id = str(fd.get("id"));
  // Clamped here as well as by the CHECK constraint: a bad value should be a
  // no-op, not a 500 in the user's face.
  const col = Math.max(0, Math.min(2, Number(str(fd.get("col")) || 0)));
  const { error } = await sb.from("action_tasks")
    .update({ col, done_at: col === 2 ? new Date().toISOString() : null })
    .eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/action-center");
}

export async function deleteTask(fd: FormData) {
  const orgId = await requireWriteOrg(); const sb = createClient();
  const { error } = await sb.from("action_tasks")
    .delete().eq("id", str(fd.get("id"))).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/action-center");
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
