import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { practiceClientLimit } from "@/lib/config";

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
  /** What Cortex has actually collected for this client, last 90 days. */
  recovered: number;
  /*
    Week-on-week receivables change, as a percentage. NULL when there is not a
    week of snapshots yet — which is different from 0, and must stay different:
    "nothing moved" and "we cannot see yet" need opposite words on screen.
  */
  movedPct: number | null;
};

export type Practice = {
  clients: ClientSignal[];
  /*
    Entitlement, resolved server-side and returned so the page can render the
    right thing rather than guess.

    `allowed` false means this plan does not include Practice at all.
    `limit` is how many client workspaces the plan covers (-1 = unlimited), and
    `overLimit` is how many are being hidden because the firm is above it.
  */
  allowed: boolean;
  plan: string;
  limit: number;
  overLimit: number;
  needAttention: number;
  totalOverdue: number;
  totalMsmeAtRisk: number;
  /*
    The firm-wide Prove number. A practice paying ₹29,999 a month wants one
    figure that says whether this was worth it, and "we collected ₹11 lakh
    across your clients" is that figure.
  */
  totalRecovered: number;
  live: boolean;
};

const EMPTY: Practice = {
  clients: [], allowed: false, plan: "", limit: 0, overLimit: 0,
  needAttention: 0, totalOverdue: 0, totalMsmeAtRisk: 0, totalRecovered: 0, live: false,
};

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

  const { data: orgRows } = await svc.from("organizations").select("id, name, plan").in("id", orgIds);
  const names = new Map(((orgRows as any[]) || []).map((o) => [String(o.id), String(o.name || "Untitled")]));

  /*
    ENTITLEMENT. Practice is a ₹29,999/month plan and this console was open to
    every workspace on any plan — practiceClientLimit() existed in config.ts
    with zero call sites anywhere in the codebase, so the cap the pricing page
    advertises ("Up to 25 client workspaces") was never applied and the feature
    that justifies the tier was free.

    Resolved from the CURRENT workspace's plan, not from any of the clients':
    the firm is the customer, the client workspaces are what they bought access
    to, and reading the plan off a client would let a firm on the cheapest tier
    unlock the console by being added to one paying client.
  */
  const { orgId: currentOrgId } = await getUserAndOrg();
  let plan = "";
  if (currentOrgId) {
    const here = ((orgRows as any[]) || []).find((o) => String(o.id) === String(currentOrgId));
    plan = String(here?.plan || "");
    if (!here) {
      try {
        const { data } = await svc.from("organizations").select("plan").eq("id", currentOrgId).single();
        plan = String((data as any)?.plan || "");
      } catch { /* leave blank — treated as not entitled below */ }
    }
  }
  const limit = practiceClientLimit(plan);
  const allowed = limit !== 0;
  if (!allowed) {
    return { ...EMPTY, plan, limit, live: true };
  }

  /*
    Apply the cap. Sorted for stability so the same 25 clients appear each time
    rather than a different arbitrary subset per request — a console whose
    contents shuffle is worse than one that is honestly truncated. The page
    tells the firm how many are hidden and why.
  */
  const allOrgIds = orgIds;
  if (limit > 0 && orgIds.length > limit) {
    orgIds = [...orgIds].sort((a, b) =>
      (names.get(a) || "").localeCompare(names.get(b) || "")).slice(0, limit);
  }
  const overLimit = Math.max(0, allOrgIds.length - orgIds.length);

  const clients: ClientSignal[] = [];

  for (const orgId of orgIds) {
    const detail: string[] = [];
    let receivablesOverdue = 0;
    let msmeAtRisk = 0;
    let openAlerts = 0;
    let lastActivity: string | null = null;
    let recovered = 0;

    // --- receivables past due -------------------------------------------
    try {
      const { data } = await svc.from("invoices")
        .select("amount, due_date, status")
        .eq("org_id", orgId).eq("type", "receivable").or("status.is.null,status.not.ilike.paid").limit(1000);
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

    // What Cortex collected for this client. Absent table -> 0, never a guess.
    try {
      const { data } = await svc.rpc("cortex_recovery_summary", { p_org: orgId, p_days: 90 });
      const r = (Array.isArray(data) ? data[0] : data) as any;
      recovered = Number(r?.amount_recovered) || 0;
    } catch { /* collections not migrated for this org */ }

    try {
      const { data } = await svc.from("health_metrics")
        .select("updated_at").eq("org_id", orgId)
        .order("updated_at", { ascending: false }).limit(1);
      lastActivity = ((data as any[]) || [])[0]?.updated_at ?? null;
    } catch { /* ignore */ }

    /*
      What moved since last week.

      This backs the Practice bullet "Whose receivables moved this week", which
      previously had nothing behind it: health_metrics is overwritten on every
      recompute, so no previous value existed anywhere to compare against.
      2026_metric_snapshots.sql keeps a daily copy and lib/movement.ts reads it.

      Only reported when there is genuinely a week of history. A client added
      yesterday gets silence here, not "0% change" — telling a CA nothing moved
      when we simply cannot see is the exact failure mode this console exists to
      avoid.
    */
    let movedPct: number | null = null;
    try {
      const { getMovement } = await import("@/lib/movement");
      const mv = await getMovement(orgId, 7, 10);
      const rec = mv.movements.find((x) => x.metricKey === "receivables");
      if (mv.haveHistory && rec && rec.deltaPct !== null) {
        movedPct = rec.deltaPct;
        const dir = rec.delta > 0 ? "up" : "down";
        const when = new Date(rec.previousAsOf).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        detail.push(`Receivables ${dir} ${Math.abs(rec.deltaPct)}% since ${when}`);
      }
    } catch { /* snapshots not migrated — say nothing rather than guess */ }

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
    /*
      A receivables book that jumped materially in a week is worth a look even
      when the absolute number is under the threshold above — a 40% rise is how
      a problem starts, and catching it there is the entire pitch.
    */
    if (movedPct !== null && movedPct >= 25 && rank === 2) {
      rank = 1;
      headline = `Receivables up ${Math.abs(movedPct)}% this week`;
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
      receivablesOverdue, msmeAtRisk, openAlerts, lastActivity, recovered, movedPct,
    });
  }

  clients.sort((a, b) =>
    a.rank - b.rank ||
    (b.msmeAtRisk + b.receivablesOverdue) - (a.msmeAtRisk + a.receivablesOverdue) ||
    a.name.localeCompare(b.name));

  return {
    clients, allowed, plan, limit, overLimit,
    needAttention: clients.filter((c) => c.rank === 0).length,
    totalOverdue: clients.reduce((n, c) => n + c.receivablesOverdue, 0),
    totalMsmeAtRisk: clients.reduce((n, c) => n + c.msmeAtRisk, 0),
    totalRecovered: clients.reduce((n, c) => n + c.recovered, 0),
    live: true,
  };
}
