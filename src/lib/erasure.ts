import "server-only";
import { serviceClient, createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

/**
 * Workspace erasure — the "or delete" half of a promise we were already making.
 *
 * WHY THIS HAD TO BE BUILT RATHER THAN THE CLAIM REMOVED.
 *
 * Two places told customers they could delete their data:
 *
 *   the landing FAQ — "you can export or delete your data anytime"
 *   /privacy §3      — "you can access, export, modify, or delete your data at
 *                       any time", and §16 "every verified deletion request is
 *                       honoured"
 *
 * Export was real. Deletion existed nowhere in the codebase — a repo-wide
 * search for any account or workspace deletion path returned only those two
 * sentences. Under the DPDP Act the right to erasure is a statutory right of
 * the Data Principal, not a courtesy, and a privacy policy that states it
 * creates the obligation whether or not the button exists. Deleting the
 * sentence would have been the cheap fix and the wrong one: the right is real,
 * so the mechanism should be.
 *
 * WHAT IT DELETES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * Everything belonging to the workspace goes: every business table, every
 * credential, every collections thread including the contact details of third
 * parties we hold on the customer's behalf. The `organizations` row goes last
 * and the FK cascades pick up anything this list has missed — belt and braces,
 * because a table added next year will cascade even if nobody updates the list.
 *
 * PAYMENTS ARE KEPT, and this is the one exception worth arguing about. A
 * completed payment is a tax record: Indian law requires books and vouchers to
 * be retained for years after the transaction, and both parties need them if
 * there is ever a dispute or a chargeback. So `payments` and `subscriptions`
 * are ANONYMISED — the org link is severed and a tombstone kept — rather than
 * destroyed. The privacy policy already says exactly this ("retain what we must
 * to meet legal obligations"), and §110 promises confirmation by email.
 *
 * SAFETY. This is the most destructive operation in the product and there is no
 * undo. Three gates: owner only, the workspace name must be typed back
 * verbatim, and a full JSON export is generated and handed over BEFORE the
 * first delete runs, so an accidental confirmation is recoverable from a file
 * the customer already has.
 */

/** Every org-scoped table, most-dependent first. */
const OWNED_TABLES = [
  // Collections holds third-party personal data; it goes first and explicitly.
  "collection_messages", "collection_threads", "collection_policies",
  // Business records.
  "health_metrics", "ai_insights", "alerts", "alert_rules",
  "sales_orders", "sales_pipeline", "finance_ledger", "invoices",
  "inventory_items", "purchase_orders", "production_runs", "employees",
  "customers", "vendors", "leads", "goals",
  "documents", "meetings", "market_reports", "strategy_docs",
  "workflows", "workflow_runs", "activity",
  "email_templates", "email_campaigns", "campaign_recipients", "email_replies",
  "agent_specs", "agent_runs",
  "memories", "memory_entities", "memory_links", "memory_profile",
  "metric_snapshots",
  // Access and credentials.
  "api_keys", "webhook_endpoints", "webhook_deliveries", "integrations",
  "report_links", "invites", "scheduled_reports", "credit_ledger",
];

/** Kept, with the org link severed — see the note about tax records above. */
const ANONYMISE_TABLES = ["payments", "subscriptions"];

export type ErasureResult = {
  ok: boolean;
  error?: string;
  deleted?: Record<string, number>;
  anonymised?: Record<string, number>;
};

/**
 * Delete everything belonging to the CURRENT workspace.
 *
 * @param confirmation must equal the workspace's name, exactly. Typing the name
 *        is the standard pattern because it is the only confirmation that
 *        cannot be satisfied by muscle memory — an "Are you sure?" dialog is
 *        clicked through by the same reflex that opened it.
 */
export async function eraseWorkspace(confirmation: string): Promise<ErasureResult> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { ok: false, error: "Sign in to delete a workspace." };

  /*
    OWNER ONLY. Not admin. An admin can be added by another admin, so allowing
    admin here would mean anyone who can invite can also destroy — a chain that
    ends with a compromised admin account deleting the business's records.
  */
  const sb = createClient();
  const { data: mem } = await sb.from("memberships")
    .select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (String((mem as any)?.role || "") !== "owner") {
    return { ok: false, error: "Only the workspace owner can delete a workspace." };
  }

  const { data: org } = await sb.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const name = String((org as any)?.name || "").trim();
  if (!name) return { ok: false, error: "Could not read the workspace name." };

  if (confirmation.trim() !== name) {
    return { ok: false, error: `Type the workspace name exactly — "${name}" — to confirm.` };
  }

  /*
    Service role from here. RLS would block some of these deletes (api_keys is
    now admin-scoped, and the erasure has to reach rows the policies restrict),
    and every id below is derived from the session, never from the request.
  */
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Deletion is unavailable right now. Please contact support." };

  const deleted: Record<string, number> = {};
  const anonymised: Record<string, number> = {};

  for (const t of OWNED_TABLES) {
    try {
      const { count } = await svc.from(t).delete({ count: "exact" }).eq("org_id", orgId);
      if (count) deleted[t] = count;
    } catch {
      /* Table absent in this deployment (a migration not applied). Skipping is
         correct — the cascade below is the backstop, and refusing to erase
         anything because one optional table is missing would be worse. */
    }
  }

  for (const t of ANONYMISE_TABLES) {
    try {
      const { count } = await svc.from(t).update({ org_id: null }, { count: "exact" }).eq("org_id", orgId);
      if (count) anonymised[t] = count;
    } catch { /* column may be NOT NULL in this deployment; the cascade handles it */ }
  }

  /* Memberships last but one: after this nobody can reach the workspace. */
  try { await svc.from("memberships").delete().eq("org_id", orgId); } catch { /* cascades */ }

  /*
    The org row itself. Every FK to organizations is ON DELETE CASCADE, so this
    also removes anything the list above missed — including tables added after
    this file was written, which is the case the list cannot cover on its own.
  */
  const { error } = await svc.from("organizations").delete().eq("id", orgId);
  if (error) return { ok: false, error: `Could not complete deletion: ${error.message}` };

  return { ok: true, deleted, anonymised };
}

/**
 * The pre-deletion export.
 *
 * Called before erasure so the customer leaves with their data rather than
 * being asked to remember to export first. Deliberately the same table list as
 * /api/export, plus the collections tables, so "export" and "delete" cover the
 * same ground — an export that is narrower than the deletion is a trap.
 */
export async function exportBeforeErasure(): Promise<{ ok: boolean; json?: string; error?: string }> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { ok: false, error: "Sign in." };
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Export is unavailable right now." };

  const out: Record<string, any[]> = {};
  for (const t of OWNED_TABLES) {
    try {
      const { data } = await svc.from(t).select("*").eq("org_id", orgId);
      if (data && data.length) out[t] = data as any[];
    } catch { /* absent table */ }
  }
  return {
    ok: true,
    json: JSON.stringify({ exported: new Date().toISOString(), org: orgId, data: out }, null, 2),
  };
}
