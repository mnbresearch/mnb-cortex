import "server-only";
import { serviceClient, createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { assertRole } from "@/lib/roles";

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
 * Export was real. Deletion existed nowhere in the codebase. Under the DPDP Act
 * the right to erasure is a statutory right of the Data Principal, not a
 * courtesy, and a privacy policy that states it creates the obligation whether
 * or not the button exists. Deleting the sentence would have been the cheap fix
 * and the wrong one: the right is real, so the mechanism should be.
 *
 * WHAT IT DELETES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * Everything belonging to the workspace goes: every business table, every
 * credential, every collections thread including the contact details of third
 * parties we hold on the customer's behalf. The `organizations` row goes last
 * and the FK cascades pick up anything the list has missed — belt and braces,
 * because a table added next year will cascade even if nobody updates the list.
 *
 * PAYMENTS ARE KEPT. A completed payment is a tax record: Indian law requires
 * books and vouchers to be retained for years, and both parties need them if
 * there is ever a dispute or a chargeback. `payments.org_id` is nullable, so
 * the link is severed and the row survives.
 *
 * `subscriptions.org_id` is NOT NULL (migration_batch4.sql:7) with an
 * ON DELETE CASCADE, so the same trick is impossible there — and attempting it
 * was WORSE than not trying: supabase-js returns `{error}` rather than throwing,
 * so the failure was swallowed, nothing was recorded, and the cascade then
 * destroyed the rows anyway while the UI reported them as retained. Subscription
 * history is now copied into `erased_subscriptions` BEFORE the cascade, which is
 * the only way to keep it.
 */

/** Every org-scoped table, most-dependent first. */
const OWNED_TABLES = [
  // Collections holds third-party personal data; it goes first and explicitly.
  "collection_messages", "collection_threads", "collection_policies",
  // Business records.
  "health_metrics", "ai_insights", "alerts", "alert_rules",
  "sales_orders", "sales_pipeline", "finance_ledger", "invoices", "quotes",
  "inventory_items", "purchase_orders", "production_runs", "employees",
  "customers", "vendors", "leads", "goals", "decisions", "action_tasks",
  "documents", "meetings", "market_reports", "strategy_docs", "chat_threads",
  "workflows", "workflow_runs", "activity",
  "email_templates", "email_campaigns", "campaign_recipients", "email_replies",
  "agent_specs", "agent_runs",
  "memories", "memory_entities", "memory_links", "memory_profile",
  "metric_snapshots", "referrals", "renewal_notices", "org_billing_log",
  // Access and credentials.
  "api_keys", "webhook_endpoints", "webhook_deliveries", "integrations",
  "report_links", "invites", "scheduled_reports", "credit_ledger", "app_settings",
];

/**
 * Tables the EXPORT must never include verbatim.
 *
 * The export exists so a customer leaves with their business data. It must not
 * become a way to read credentials that RLS and the /developers guard were just
 * tightened to protect — an export endpoint that dumps `api_keys.key` and
 * `webhook_endpoints.secret` reopens exactly the hole those changes closed.
 *
 * These tables are exported with their secret column removed rather than
 * dropped entirely, because knowing WHICH integrations existed is legitimately
 * part of your data; knowing the key is not, and you cannot use it after the
 * workspace is gone anyway.
 */
const REDACT: Record<string, string[]> = {
  api_keys: ["key"],
  webhook_endpoints: ["secret"],
  integrations: ["config", "credentials", "api_key", "token", "secret"],
};

export type ErasureResult = {
  ok: boolean;
  error?: string;
  deleted?: Record<string, number>;
  retained?: Record<string, number>;
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
  const retained: Record<string, number> = {};

  /*
    ---------------------------------------------------------------------
    RETENTION FIRST, while the rows still exist and the org row still
    anchors them. Doing this after the deletes would be reading from a
    cascade that has already run.
  */

  /* payments.org_id is nullable — sever the link and keep the row. */
  try {
    const { count } = await svc.from("payments").update({ org_id: null }, { count: "exact" }).eq("org_id", orgId);
    if (count) retained.payments = count;
  } catch { /* table absent in this deployment */ }

  /*
    subscriptions.org_id is NOT NULL with ON DELETE CASCADE, so it cannot be
    orphaned in place. Copy what we are required to retain into a table with no
    FK to organizations, then let the cascade take the original.

    Best-effort: if the archive table has not been migrated, we do NOT silently
    proceed — the caller is told, because "your payment history was kept" is a
    promise in the UI and in the privacy policy.
  */
  let subsArchived = 0;
  try {
    const { data: subs } = await svc.from("subscriptions").select("*").eq("org_id", orgId);
    const rows = (subs as any[]) || [];
    if (rows.length) {
      const { error } = await svc.from("erased_subscriptions").insert(
        rows.map((r) => ({
          original_id: r.id, plan: r.plan, status: r.status, provider: r.provider,
          amount: r.amount, reference: r.reference, created_at: r.created_at,
          erased_at: new Date().toISOString(),
        })),
      );
      if (error) {
        return {
          ok: false,
          error: "Could not archive your subscription history, which we are required to retain. "
               + "Nothing has been deleted. Please contact support — this needs a migration applied.",
        };
      }
      subsArchived = rows.length;
      retained.subscriptions = rows.length;
    }
  } catch {
    return {
      ok: false,
      error: "Could not archive your subscription history, which we are required to retain. "
           + "Nothing has been deleted. Please contact support.",
    };
  }

  /*
    ---------------------------------------------------------------------
    Now the deletes.

    ORDER MATTERS, and the order here is the opposite of the obvious one.
    `memberships` is deleted LAST, immediately before the org row, because it is
    what makes the workspace reachable: getUserAndOrg() resolves orgId from
    memberships, so a run that dies after removing them leaves the owner unable
    to reach the settings page — and therefore unable to retry — while the org
    and whatever had not been deleted yet survive with nobody able to see them.
    Recovering that needs manual database access.

    An error on any table is recorded and the run CONTINUES. Aborting halfway is
    the worst outcome: a partially deleted workspace is neither usable nor gone,
    and the cascade at the end is what guarantees completeness anyway.
  */
  const failures: string[] = [];
  for (const t of OWNED_TABLES) {
    try {
      const { count, error } = await svc.from(t).delete({ count: "exact" }).eq("org_id", orgId);
      if (error) {
        /* A table that does not exist in this deployment is expected and fine;
           anything else is worth telling the user about. */
        if (!/does not exist|schema cache|relation/i.test(error.message || "")) failures.push(t);
      } else if (count) deleted[t] = count;
    } catch { failures.push(t); }
  }

  try { await svc.from("memberships").delete().eq("org_id", orgId); } catch { /* cascades */ }

  /*
    The org row itself. Every FK to organizations is ON DELETE CASCADE, so this
    also removes anything the list above missed — including tables added after
    this file was written, which is the case a hand-maintained list cannot cover.
  */
  const { error } = await svc.from("organizations").delete().eq("id", orgId);
  if (error) return { ok: false, error: `Could not complete deletion: ${error.message}` };

  if (failures.length) {
    /* The workspace IS gone — the cascade saw to that — but say so honestly
       rather than reporting a clean run. */
    return {
      ok: true, deleted, retained,
      error: `Deleted, but some tables reported errors and were removed by cascade instead: ${failures.join(", ")}.`,
    };
  }

  return { ok: true, deleted, retained };
}

/**
 * The pre-deletion export.
 *
 * Called before erasure so the customer leaves with their data rather than
 * being asked to remember to export first.
 *
 * OWNER ONLY, and credentials are redacted. Both matter:
 *
 *   This is a "use server" export, which means it is a POST-able endpoint for
 *   any authenticated user whose browser has loaded the settings bundle — the
 *   fact that the button is rendered only for owners protects nothing. Without
 *   the role check, a `viewer` could call it and receive `api_keys.key` and
 *   `webhook_endpoints.secret`, undoing the RLS tightening and the /developers
 *   guard in one step. That is not hypothetical: this function shipped that way
 *   in the same commit that closed those holes, which is exactly how a service-
 *   role helper reopens something RLS was just fixed to protect.
 */
export async function exportBeforeErasure(): Promise<{ ok: boolean; json?: string; error?: string }> {
  let orgId: string;
  try { ({ orgId } = await assertRole("owner")); }
  catch { return { ok: false, error: "Only the workspace owner can export the whole workspace." }; }

  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Export is unavailable right now." };

  const out: Record<string, any[]> = {};
  for (const t of [...OWNED_TABLES, "payments", "subscriptions"]) {
    try {
      const { data } = await svc.from(t).select("*").eq("org_id", orgId);
      let rows = (data as any[]) || [];
      const drop = REDACT[t];
      if (drop && rows.length) {
        rows = rows.map((r) => {
          const copy = { ...r };
          for (const k of drop) if (k in copy) copy[k] = "[redacted]";
          return copy;
        });
      }
      if (rows.length) out[t] = rows;
    } catch { /* absent table */ }
  }
  return {
    ok: true,
    json: JSON.stringify({
      exported: new Date().toISOString(),
      org: orgId,
      note: "API keys, webhook signing secrets and integration credentials are redacted. "
          + "They authenticate access to this workspace and are of no use once it is deleted.",
      data: out,
    }, null, 2),
  };
}
