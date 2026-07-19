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
    const rows: OrgRow[] = [];
    for (const o of (orgs as any[]) || []) {
      const [{ count: members }, { count: metrics }, { count: alerts }] = await Promise.all([
        sb.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", o.id),
        sb.from("health_metrics").select("id", { count: "exact", head: true }).eq("org_id", o.id),
        sb.from("alerts").select("id", { count: "exact", head: true }).eq("org_id", o.id),
      ]);
      rows.push({
        id: o.id, name: o.name, industry: o.industry, plan: o.plan, currency: o.currency,
        created_at: o.created_at, members: members || 0, metrics: metrics || 0, alerts: alerts || 0,
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
