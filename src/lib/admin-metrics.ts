import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/config";
import { PAYMENTS_TABLE } from "@/lib/pay/table";

/**
 * Platform economics for the operator.
 *
 * The point of this module is that you can see, on one screen, whether the
 * business is making money — revenue collected against what the AI providers
 * actually cost us. Nothing in the product showed that, which is exactly how a
 * ₹270-per-clip loss on video survived: credits were metered, but nobody could
 * see what the credits were costing.
 *
 * Costs are ESTIMATED from the credit ledger, not read from Google. They are
 * good enough to spot a loss-making customer or a runaway feature; reconcile
 * against the real bill monthly.
 */

/** ₹ per unit, from ai.google.dev (Aug 2026) at ~₹95.77/USD. */
export const UNIT_COST_INR: Record<string, number> = {
  // A grounded call, ~2.5k in / 600 out. gemini-2.5-flash (₹0.22) 404s on our
  // key, so this reflects the models we can actually reach: ₹0.40 on
  // gemini-3.7/3.6-flash, ₹0.88 if it falls all the way back to 3.5-flash.
  // Taking the pessimistic end — understating cost is the dangerous direction.
  text: 0.88,
  // three larger calls, at the same pessimistic per-call rate
  deepdive: 3.9,
  // gemini-2.5-flash-image, $0.039
  agent_image: 3.74,
  // Veo 3.1 Fast 720p, $0.10/s × 8s
  agent_video: 76.62,
};

/** What one charge of a given mode costs US, in rupees. */
export function costOfMode(mode: string): number {
  const m = String(mode || "").replace(/^ai:/, "").toLowerCase();
  if (m === "agent_video") return UNIT_COST_INR.agent_video;
  if (m === "agent_image") return UNIT_COST_INR.agent_image;
  if (m === "deepdive") return UNIT_COST_INR.deepdive;
  // Everything else is one text call. Heavier modes send more context, so this
  // is a floor rather than an exact figure — deliberately, since a floor that
  // understates cost is the dangerous direction, and text is cheap enough that
  // the error is small in absolute terms.
  return UNIT_COST_INR.text;
}

export type ModeUsage = { mode: string; runs: number; credits: number; costInr: number };

export type PlatformEconomics = {
  live: boolean;
  reason?: string;
  /** Collected, ever and in the last 30 days. */
  revenueTotal: number;
  revenue30d: number;
  /** Committed monthly recurring revenue from workspaces on an active plan. */
  mrr: number;
  payingOrgs: number;
  totalOrgs: number;
  activeOrgs: number;
  paygOrgs: number;
  /** Estimated AI spend over the last 30 days. */
  cogs30d: number;
  grossMargin30d: number | null;
  usage: ModeUsage[];
  /** Workspaces whose 30-day AI cost is closest to (or past) what they pay. */
  watchlist: { org_id: string; name: string; plan: string; cost30d: number; monthly: number }[];
  /** The actual rows behind the revenue figure — a total you cannot drill into
   *  is a number you cannot trust. Newest first. */
  recentPayments: { order_id: string; org: string; kind: string; ref: string; amount: number; when: string; unattributed: boolean }[];
  /** Paid but not granted. See the query in this file for what each status means. */
  failedPayments: { order_id: string; org: string; kind: string; ref: string; amount: number; when: string; status: string }[];
  /** Payments that activated no workspace — money in, nothing granted. */
  unattributedCount: number;
  unattributedAmount: number;
};

const DAY = 86_400_000;

export async function getPlatformEconomics(): Promise<PlatformEconomics> {
  const empty: PlatformEconomics = {
    live: false, revenueTotal: 0, revenue30d: 0, mrr: 0, payingOrgs: 0,
    totalOrgs: 0, activeOrgs: 0, paygOrgs: 0, cogs30d: 0, grossMargin30d: null,
    usage: [], watchlist: [], recentPayments: [], failedPayments: [], unattributedCount: 0, unattributedAmount: 0,
  };
  const sb = serviceClient();
  if (!sb) return { ...empty, reason: "SUPABASE_SERVICE_ROLE_KEY not set" };

  try {
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const priceOf = new Map(PLANS.map((p) => [p.id, p.monthly]));

    const [paymentsRes, failedRes, ungrantedRes, orgsRes, ledgerRes] = await Promise.all([
      /*
        Still filtered on `kind`, even though cortex_payments is now ours alone.

        The table was shared with a school/tuition app whose rows also carried
        status='paid', and summing every paid row reported their takings as MNB
        Cortex revenue — the ~₹79K of null-org_id rows. The split removes the
        cause, but the backfill copied history across, so the filter still earns
        its place: it keeps any mis-attributed legacy row out of the total.

        `kind` rather than `org_id` because erasure nulls org_id to unlink a
        deleted workspace while keeping the financial record, and an org_id
        filter would silently drop that history from the totals.
      */
      /*
        A PARTIALLY REFUNDED PAYMENT USED TO VANISH FROM REVENUE ENTIRELY.

        This was `.eq("status", "paid")`, and a refund overwrites the status
        with `refunded:…`. Full refunds dropping out is correct. But partial
        refunds now exist — ₹500 back on ₹8,000 — and dropping the whole row
        reports ₹0 of revenue for a sale that kept ₹7,500. The refunded amount
        is subtracted below instead, which is what the number means.
      */
      sb.from(PAYMENTS_TABLE).select("order_id, amount, status, created_at, org_id, kind, ref, refunded_amount")
        /* An explicit list rather than a LIKE on "refunded:%": the statuses are
           written from one place (refund.ts) and enumerating them here means a
           new one shows up as missing revenue in a test rather than as a
           pattern that silently starts matching something else. */
        .in("status", ["paid", "refunded:reversed", "refunded:partial", "refunded:recorded_only"])
        .not("kind", "is", null).order("created_at", { ascending: false }).limit(20_000),
      /*
        THE PAYMENTS THAT TOOK MONEY AND GRANTED NOTHING.

        The query above filters `.eq("status", "paid")`, which is right for a
        REVENUE total and wrong for everything else on this page — it excludes,
        by construction, the three statuses that mean a customer is unhappy:

          amount_mismatch  — underpaid or tampered; deliberately not granted.
          grant_unverified — settle.ts could not confirm the plan landed. Its
                             own comment says "support can fix it from the
                             payments row", and no screen showed that row.
          unknown_ref      — the order named a plan or pack not in the current
                             catalogue (a checkout opened before an id was
                             retired). Money in, nothing out.

        So the one section of the console titled "Money" was structurally
        incapable of displaying the cases where money went wrong. The customer
        always found out first. Kept as a separate query rather than widening
        the one above, so the revenue figure stays a sum of money actually
        received. (The query above is no longer `.eq("status","paid")` — it
        includes refunded rows and nets the refunded amount off. This comment
        used to describe the old filter, which is the sort of drift that makes
        a comment worse than none.)

        AND THEN THE LIST OF THREE WAS ITSELF INCOMPLETE.

        grant_failed is written by the subscription handler when a recurring
        debit is taken and the workspace update fails. It was read by exactly
        one other line of code — the idempotency check that writes it — and
        appeared in neither the revenue total nor this list. A customer on
        autorenew paid, got nothing, and the product displayed that fact
        nowhere at all.

        refunded:recorded_only is the status written when a REVERSAL FAILED:
        we refunded the money and the customer kept the product. Also absent.

        And the biggest one is not a status: `paid` with no granted_at. `paid`
        is written to CLAIM an order, before the entitlement exists, so a
        process that died in between leaves a row that reads as a normal sale
        and counts as revenue. It is handled as its own query below, because
        the grace period matters — a payment settled ninety seconds ago is
        mid-flight, not broken.
      */
      sb.from(PAYMENTS_TABLE).select("order_id, amount, status, created_at, org_id, kind, ref, granted_at")
        .in("status", ["amount_mismatch", "grant_unverified", "unknown_ref", "grant_failed",
                       "refunded:recorded_only", "refund_unmatched", "refund_needs_review",
                       "sub_no_plan_note", "sub_unknown_plan", "sub_amount_below_cycle"])
        .order("created_at", { ascending: false }).limit(200),
      /*
        PAID, AND NOT CONFIRMED DELIVERED. The queue the reconciliation job
        works, shown to the operator so a discrepancy is visible between runs
        rather than only in a cron log.
      */
      sb.from(PAYMENTS_TABLE).select("order_id, amount, status, created_at, org_id, kind, ref, granted_at")
        .eq("status", "paid").is("granted_at", null)
        .lt("created_at", new Date(Date.now() - 20 * 60_000).toISOString())
        .order("created_at", { ascending: false }).limit(200),
      sb.from("organizations").select("id, name, plan, subscription_status, subscription_ends_at, credits").limit(5_000),
      // Only AI charges. Refunds and grants carry other reasons.
      sb.from("credit_ledger").select("org_id, reason, delta, created_at").lt("delta", 0).gte("created_at", since).limit(100_000),
    ]);

    /*
      A FAILED QUERY IS NOT ₹0 OF REVENUE.

      Every one of these results had its error discarded, so a query that broke
      — a column not yet migrated, a timeout — rendered the Money section as
      live: true with zero revenue and no explanation. An operator reading that
      screen would conclude the business had taken nothing.
    */
    const qErr = paymentsRes.error || failedRes?.error || ungrantedRes?.error || orgsRes.error || ledgerRes?.error;
    if (qErr) {
      return { ...empty, reason: `A platform query failed: ${qErr.message}. Figures are withheld rather than shown as zero.` };
    }
    const payments = (paymentsRes.data as any[]) || [];
    /*
      One list for the operator: everything where money moved and the customer
      did not get what they paid for, whatever shape the failure took. Merged
      here rather than in the query because they are two different questions —
      a status that says "wrong", and a status that says "fine" beside a
      granted_at that says otherwise.
    */
    const failedRows = [
      ...((failedRes?.data as any[]) || []),
      ...((ungrantedRes?.data as any[]) || []).map((p) => ({ ...p, status: "paid_not_granted" })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const orgs = (orgsRes.data as any[]) || [];
    const ledger = (ledgerRes.data as any[]) || [];

    const cutoff = Date.now() - 30 * DAY;
    let revenueTotal = 0, revenue30d = 0;
    for (const p of payments) {
      /* NET of anything sent back. Money we took and returned is not revenue,
         and a partial refund reduces the sale rather than erasing it. */
      const amt = Math.max(0, (Number(p.amount) || 0) - (Number(p.refunded_amount) || 0));
      revenueTotal += amt;
      if (new Date(p.created_at).getTime() >= cutoff) revenue30d += amt;
    }

    let mrr = 0, payingOrgs = 0, activeOrgs = 0, paygOrgs = 0;
    const orgName = new Map<string, { name: string; plan: string; monthly: number }>();
    for (const o of orgs) {
      const plan = String(o.plan || "starter").toLowerCase();
      const monthly = priceOf.get(plan) ?? 0;
      orgName.set(o.id, { name: o.name || "—", plan, monthly });
      const status = String(o.subscription_status || "");
      const live = status === "active" && (!o.subscription_ends_at || new Date(o.subscription_ends_at).getTime() > Date.now());
      if (live) { activeOrgs++; if (monthly > 0) { mrr += monthly; payingOrgs++; } }
      else if (Number(o.credits ?? 0) > 0) paygOrgs++;
    }

    // Usage and cost by mode.
    const byMode = new Map<string, ModeUsage>();
    const byOrg = new Map<string, number>();
    for (const row of ledger) {
      const reason = String(row.reason || "");
      if (!reason.startsWith("ai:")) continue;
      const mode = reason.slice(3);
      const credits = Math.abs(Number(row.delta) || 0);
      const cost = costOfMode(mode);
      const cur = byMode.get(mode) || { mode, runs: 0, credits: 0, costInr: 0 };
      cur.runs += 1; cur.credits += credits; cur.costInr += cost;
      byMode.set(mode, cur);
      byOrg.set(row.org_id, (byOrg.get(row.org_id) || 0) + cost);
    }
    const usage = [...byMode.values()].sort((a, b) => b.costInr - a.costInr);
    const cogs30d = usage.reduce((a, u) => a + u.costInr, 0);

    // Anyone whose AI cost is running above a third of what they pay is worth
    // a look before it becomes a loss.
    const watchlist = [...byOrg.entries()]
      .map(([org_id, cost30d]) => {
        const meta = orgName.get(org_id);
        return { org_id, name: meta?.name || "—", plan: meta?.plan || "—", cost30d, monthly: meta?.monthly ?? 0 };
      })
      .filter((r) => r.cost30d > 0 && (r.monthly === 0 || r.cost30d > r.monthly * 0.33))
      .sort((a, b) => b.cost30d - a.cost30d)
      .slice(0, 10);

    /*
      A payment with no org_id is money received that activated nobody. Every
      writer in the current code sets it, so these are legacy or hand-inserted
      rows — but they still count into the revenue figure above, and if any of
      them is a real customer then that customer paid and got nothing.

      Flagged rather than hidden, and the order_id is carried through so the
      payment can actually be found in Cashfree. Before this the row showed
      "— / — / ₹3.0K", which is unactionable: the section promises to surface
      exactly this case and could not identify a single one.
    */
    /*
      NET, LIKE THE TOTAL. This list is described above as "the actual rows
      behind the revenue figure", and it was showing gross amounts while the
      total netted refunds off — so a fully refunded ₹8,999 appeared as ₹8,999
      beside ₹0 of revenue, and the drill-down contradicted the number it was
      supposed to explain. A total you cannot reconcile against its own rows is
      exactly the kind of figure this module exists to stop.
    */
    const net = (p: any) => Math.max(0, (Number(p.amount) || 0) - (Number(p.refunded_amount) || 0));
    const recentPayments = payments.slice(0, 15).map((p: any) => ({
      order_id: String(p.order_id || "—"),
      org: orgName.get(p.org_id)?.name || "—",
      kind: String(p.kind || "—"),
      ref: String(p.ref || "—"),
      amount: net(p),
      when: p.created_at,
      unattributed: !p.org_id || !orgName.get(p.org_id),
    }));

    const unattributedCount = payments.filter((p: any) => !p.org_id || !orgName.get(p.org_id)).length;
    const unattributedAmount = payments
      .filter((p: any) => !p.org_id || !orgName.get(p.org_id))
      .reduce((sum: number, p: any) => sum + net(p), 0);

    return {
      live: true,
      recentPayments,
      failedPayments: failedRows.map((p: any) => ({
        order_id: String(p.order_id || ""),
        org: (p.org_id && orgName.get(p.org_id)?.name) || "not linked",
        kind: String(p.kind || "—"),
        ref: String(p.ref || "—"),
        amount: Number(p.amount) || 0,
        when: p.created_at,
        status: String(p.status || ""),
      })),
      unattributedCount, unattributedAmount,
      revenueTotal, revenue30d, mrr, payingOrgs,
      totalOrgs: orgs.length, activeOrgs, paygOrgs,
      cogs30d,
      grossMargin30d: revenue30d > 0 ? (1 - cogs30d / revenue30d) * 100 : null,
      usage, watchlist,
    };
  } catch (e: any) {
    return { ...empty, reason: e?.message || "Could not read platform economics." };
  }
}
