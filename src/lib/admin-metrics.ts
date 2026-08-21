import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/config";

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
  // gemini-2.5-flash, ~2.5k in / 600 out for a grounded call
  text: 0.22,
  // a Deep Dive is three larger calls
  deepdive: 0.99,
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
};

const DAY = 86_400_000;

export async function getPlatformEconomics(): Promise<PlatformEconomics> {
  const empty: PlatformEconomics = {
    live: false, revenueTotal: 0, revenue30d: 0, mrr: 0, payingOrgs: 0,
    totalOrgs: 0, activeOrgs: 0, paygOrgs: 0, cogs30d: 0, grossMargin30d: null,
    usage: [], watchlist: [],
  };
  const sb = serviceClient();
  if (!sb) return { ...empty, reason: "SUPABASE_SERVICE_ROLE_KEY not set" };

  try {
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const priceOf = new Map(PLANS.map((p) => [p.id, p.monthly]));

    const [paymentsRes, orgsRes, ledgerRes] = await Promise.all([
      sb.from("payments").select("amount, status, created_at, org_id, kind").eq("status", "paid").limit(20_000),
      sb.from("organizations").select("id, name, plan, subscription_status, subscription_ends_at, credits").limit(5_000),
      // Only AI charges. Refunds and grants carry other reasons.
      sb.from("credit_ledger").select("org_id, reason, delta, created_at").lt("delta", 0).gte("created_at", since).limit(100_000),
    ]);

    const payments = (paymentsRes.data as any[]) || [];
    const orgs = (orgsRes.data as any[]) || [];
    const ledger = (ledgerRes.data as any[]) || [];

    const cutoff = Date.now() - 30 * DAY;
    let revenueTotal = 0, revenue30d = 0;
    for (const p of payments) {
      const amt = Number(p.amount) || 0;
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

    return {
      live: true,
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
