import "server-only";
import { createClient, serviceClient, hasSupabase } from "@/lib/supabase/server";
import { SUPER_ADMINS, MY_BUSINESSES } from "@/lib/config";

/** Platform-level check: is the signed-in user an operator of the whole platform? */
export async function isSuperAdmin(): Promise<boolean> {
  if (!hasSupabase()) return false;
  try {
    const { data: { user } } = await createClient().auth.getUser();
    const email = (user?.email || "").toLowerCase();
    return Boolean(email) && SUPER_ADMINS.includes(email);
  } catch { return false; }
}

export async function currentEmail(): Promise<string | null> {
  if (!hasSupabase()) return null;
  try { const { data: { user } } = await createClient().auth.getUser(); return user?.email ?? null; } catch { return null; }
}

export type OrgRow = {
  id: string; name: string; industry: string | null; plan: string | null;
  currency: string | null; created_at: string; members: number; metrics: number; alerts: number;
  subscription_status: string | null; trial_ends_at: string | null; credits: number; credits_allowance: number | null;
  subscription_ends_at: string | null; autorenew_status: string | null;
};

/**
 * Platform-wide org list. Uses the service role (bypasses RLS) and is only ever
 * called from a page that has already verified isSuperAdmin().
 */
export async function getAllOrgs(): Promise<{ rows: OrgRow[]; live: boolean; reason?: string }> {
  const sb = serviceClient();
  if (!sb) return { rows: [], live: false, reason: "SUPABASE_SERVICE_ROLE_KEY not set" };
  try {
    const { data: orgs, error } = await sb.from("organizations").select("*").order("created_at", { ascending: false });
    if (error) return { rows: [], live: false, reason: error.message };
    const list = (orgs as any[]) || [];

    // Three COUNT queries per organisation was 1,501 round-trips at 500
    // customers — this page would have timed out long before it became useful,
    // and it's the page you'd be looking at while deciding whether to keep
    // spending on ads. Three queries total instead, tallied in memory.
    const ids = list.map((o) => o.id);
    const tally = async (table: string) => {
      const map = new Map<string, number>();
      if (!ids.length) return map;
      const { data } = await sb.from(table).select("org_id").in("org_id", ids).limit(100_000);
      for (const r of ((data as any[]) || [])) {
        const k = String(r.org_id);
        map.set(k, (map.get(k) || 0) + 1);
      }
      return map;
    };
    const [memberBy, metricBy, alertBy] = await Promise.all([
      tally("memberships"), tally("health_metrics"), tally("alerts"),
    ]);

    const rows: OrgRow[] = [];
    for (const o of list) {
      const members = memberBy.get(o.id) || 0;
      const metrics = metricBy.get(o.id) || 0;
      const alerts = alertBy.get(o.id) || 0;
      rows.push({
        id: o.id, name: o.name, industry: o.industry, plan: o.plan, currency: o.currency,
        created_at: o.created_at, members: members || 0, metrics: metrics || 0, alerts: alerts || 0,
        subscription_status: o.subscription_status ?? null, trial_ends_at: o.trial_ends_at ?? null,
        subscription_ends_at: o.subscription_ends_at ?? null, autorenew_status: o.autorenew_status ?? null,
        credits: Number(o.credits ?? 0), credits_allowance: o.credits_allowance ?? null,
      });
    }
    return { rows, live: true };
  } catch (e: any) { return { rows: [], live: false, reason: e?.message }; }
}

/** Which of my portfolio businesses already exist as workspaces. */
export async function getPortfolioStatus() {
  const { rows, live, reason } = await getAllOrgs();
  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r]));
  return {
    live, reason,
    businesses: MY_BUSINESSES.map((b) => ({ ...b, org: byName.get(b.name.toLowerCase()) || null })),
  };
}
