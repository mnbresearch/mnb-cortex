import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

/**
 * The Practice console — every client a firm watches, on one screen.
 *
 * WHY THIS IS THE PRODUCT'S BEST DISTRIBUTION.
 *
 * India has hundreds of thousands of practising chartered accountants, and each
 * one already holds the books of dozens of SMEs. Selling to one CA is selling to
 * thirty businesses, with the trust already established — the CA is the person
 * the owner actually rings when a number looks wrong.
 *
 * And it is a job nobody currently does. Tally, Zoho and Vyapar are single-
 * business tools: a CA managing thirty clients opens thirty files to find out
 * which one is in trouble. There is no screen anywhere that answers "across all
 * my clients, who needs me this week?" That question is the entire product here.
 *
 * WHAT MAKES IT WORK RATHER THAN BEING A LIST.
 *
 * A portfolio view is only useful if it RANKS. Thirty rows of green is the same
 * as no screen at all. So every client gets a single severity, computed from
 * things that are real and dated — a statutory deadline inside the window, a
 * 43B(h) clock past 45 days, receivables that moved materially — and the list is
 * ordered worst-first. The firm looks at the top three and closes the tab.
 *
 * TENANCY. A firm sees a client because a MEMBERSHIP exists, exactly like any
 * other multi-workspace user. There is no new access path and no way to reach a
 * workspace you were not added to; this module only aggregates what the user
 * could already open one at a time.
 */

export type ClientSignal = {
  orgId: string;
  name: string;
  /** 0 = needs attention now, 1 = worth a look, 2 = quiet. */
  rank: 0 | 1 | 2;
  headline: string;
  detail: string[];
  receivablesOverdue: number;
  msmeAtRisk: number;
  openAlerts: number;
  lastActivity: string | null;
};

export type Practice = {
  clients: ClientSignal[];
  needAttention: number;
  totalOverdue: number;
  totalMsmeAtRisk: number;
  live: boolean;
};

const EMPTY: Practice = { clients: [], needAttention: 0, totalOverdue: 0, totalMsmeAtRisk: 0, live: false };

/**
 * Every workspace this user belongs to, with the signals that decide urgency.
 *
 * Reads are per-client and bounded. Deliberately NOT one giant join: the
 * membership list is the security boundary, and looping over exactly the orgs
 * the user is a member of makes it impossible to return a row for one they are
 * not — a mistake that a clever aggregate query makes easy.
 */
export async function getPractice(): Promise<Practice> {
  const { user } = await getUserAndOrg();
  if (!user) return EMPTY;

  const svc = serviceClient();
  if (!svc) return EMPTY;

  let orgIds: string[] = [];
  try {
    const { data } = await svc.from("memberships").select("org_id").eq("user_id", user.id).limit(200);
    orgIds = [...new Set(((data as any[]) || []).map((m) => String(m.org_id)))];
  } catch { return EMPTY; }
  if (!orgIds.length) return EMPTY;

  const { data: orgRows } = await svc.from("organizations").select("id, name").in("id", orgIds);
  const names = new Map(((orgRows as any[]) || []).map((o) => [String(o.id), String(o.name || "Untitled")]));

  const clients: ClientSignal[] = [];

  for (const orgId of orgIds) {
    const detail: string[] = [];
    let receivablesOverdue = 0;
    let msmeAtRisk = 0;
    let openAlerts = 0;
    let lastActivity: string | null = null;

    // --- receivables past due -------------------------------------------
    try {
      const { data } = await svc.from("invoices")
        .select("amount, due_date, status")
        .eq("org_id", orgId).eq("type", "receivable").neq("status", "paid").limit(1000);
      const today = Date.now();
      for (const r of ((data as any[]) || [])) {
        if (!r.due_date) continue;
        const overdueBy = Math.round((today - new Date(r.due_date).getTime()) / 86_400_000);
        if (overdueBy > 0) receivablesOverdue += Number(r.amount) || 0;
      }
    } catch { /* table shape differs — skip this signal, keep the client */ }

    // --- 43B(h) exposure -------------------------------------------------
    try {
      const { data } = await svc.rpc("cortex_msme_exposure", { p_org: orgId });
      for (const r of ((data as any[]) || [])) {
        const covered = r.udyam_category === "micro" || r.udyam_category === "small";
        if (covered && r.past_window) msmeAtRisk += Number(r.total_amount) || 0;
      }
    } catch { /* migration not applied for this org — no claim made */ }

    // --- open alerts -----------------------------------------------------
    try {
      const { count } = await svc.from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("is_read", false);
      openAlerts = count || 0;
    } catch { /* ignore */ }

    try {
      const { data } = await svc.from("health_metrics")
        .select("updated_at").eq("org_id", orgId)
        .order("updated_at", { ascending: false }).limit(1);
      lastActivity = ((data as any[]) || [])[0]?.updated_at ?? null;
    } catch { /* ignore */ }

    /*
      Severity.

      Deliberately conservative about what counts as urgent. A 43B(h) clock past
      the window has a dated tax consequence, so it is always rank 0. Overdue
      receivables are rank 0 only above a material threshold — every business
      has someone a week late, and a console that shouts about ₹4,000 gets
      ignored, at which point it stops working for the ₹40 lakh case too.
    */
    let rank: 0 | 1 | 2 = 2;
    let headline = "Nothing needs you this week";

    if (msmeAtRisk > 0) {
      rank = 0;
      headline = `₹${Math.round(msmeAtRisk).toLocaleString("en-IN")} of deductions at risk`;
      detail.push("Micro/small supplier bills past the 45-day window (43B(h))");
    }
    if (receivablesOverdue >= 500_000) {
      rank = 0;
      if (!msmeAtRisk) headline = `₹${Math.round(receivablesOverdue).toLocaleString("en-IN")} overdue from customers`;
      detail.push(`₹${Math.round(receivablesOverdue).toLocaleString("en-IN")} past due`);
    } else if (receivablesOverdue > 0) {
      if (rank === 2) { rank = 1; headline = `₹${Math.round(receivablesOverdue).toLocaleString("en-IN")} overdue`; }
      detail.push(`₹${Math.round(receivablesOverdue).toLocaleString("en-IN")} past due`);
    }
    if (openAlerts > 0) {
      if (rank === 2) { rank = 1; headline = `${openAlerts} open alert${openAlerts === 1 ? "" : "s"}`; }
      detail.push(`${openAlerts} unread alert${openAlerts === 1 ? "" : "s"}`);
    }

    /*
      A client with NO data is not "quiet" — it is unknown, and saying "nothing
      needs you" about a workspace nobody has imported anything into is the
      false reassurance this product keeps having to design against.
    */
    if (!lastActivity && !openAlerts && !receivablesOverdue && !msmeAtRisk) {
      rank = 1;
      headline = "No data yet — nothing to watch";
      detail.push("Import this client's books to start watching");
    }

    clients.push({
      orgId, name: names.get(orgId) || "Untitled", rank, headline, detail,
      receivablesOverdue, msmeAtRisk, openAlerts, lastActivity,
    });
  }

  clients.sort((a, b) =>
    a.rank - b.rank ||
    (b.msmeAtRisk + b.receivablesOverdue) - (a.msmeAtRisk + a.receivablesOverdue) ||
    a.name.localeCompare(b.name));

  return {
    clients,
    needAttention: clients.filter((c) => c.rank === 0).length,
    totalOverdue: clients.reduce((n, c) => n + c.receivablesOverdue, 0),
    totalMsmeAtRisk: clients.reduce((n, c) => n + c.msmeAtRisk, 0),
    live: true,
  };
}
