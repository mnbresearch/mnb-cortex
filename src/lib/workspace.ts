import "server-only";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/credits";
import { TRIAL_CREDITS } from "@/lib/config";

const TRIAL_DAYS = 3;

/**
 * Ensure the signed-in user has a workspace. Called after every sign-in
 * (password, magic-link or Google) so a brand-new customer lands in a real,
 * working workspace instead of an empty app.
 *
 * - Reads the user from the cookie session (secure), then uses the service role
 *   to create the org + owner membership (bypasses RLS for the bootstrap).
 * - Idempotent: if the user is already a member of any workspace, it's a no-op.
 * - Starts a 3-day trial and grants the one-time trial credits.
 */
export async function ensureWorkspace(opts?: { name?: string; industry?: string }): Promise<{ ok: boolean; orgId?: string; created?: boolean; error?: string }> {
  const anon = createClient();
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Service role not configured." };

  const meta: any = user.user_metadata || {};
  const wantName = String(opts?.name || meta.company || "").slice(0, 80).trim();

  // A DB signup trigger may already have created a workspace. Reuse it if so;
  // otherwise create one. Either way we then ensure it's fully provisioned.
  const { data: mems } = await svc.from("memberships").select("org_id").eq("user_id", user.id).limit(1);
  let orgId = (mems && mems.length) ? String((mems[0] as any).org_id) : "";
  let created = false;

  if (!orgId) {
    const name = wantName || meta.full_name || (user.email || "").split("@")[0] || "My workspace";
    const { data: org, error } = await svc.from("organizations")
      .insert({ name, industry: opts?.industry || meta.industry || null, currency: "INR", plan: "growth", accent: "gold" })
      .select("id").single();
    if (error || !org) return { ok: false, error: error?.message || "Could not create your workspace." };
    orgId = String((org as any).id);
    created = true;
    await svc.from("memberships").insert({ org_id: orgId, user_id: user.id, role: "owner" });
  }

  // Rename a generic trigger-created workspace to the name the user actually typed.
  if (wantName) {
    try {
      const { data: o } = await svc.from("organizations").select("name").eq("id", orgId).single();
      const cur = String((o as any)?.name || "");
      if (/^my (company|workspace|business)$/i.test(cur) && wantName.toLowerCase() !== cur.toLowerCase()) {
        await svc.from("organizations").update({ name: wantName }).eq("id", orgId);
      }
    } catch { /* ignore */ }
  }

  // Ensure a trial window + status if not already set (migration-safe).
  try {
    const { data: o } = await svc.from("organizations").select("trial_ends_at, subscription_status").eq("id", orgId).single();
    if (!(o as any)?.trial_ends_at) {
      await svc.from("organizations").update({
        subscription_status: (o as any)?.subscription_status || "trialing",
        trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
      }).eq("id", orgId);
    }
  } catch { /* ignore */ }

  // Profile row (best-effort).
  try { await svc.from("profiles").upsert({ id: user.id, full_name: meta.full_name || null }); } catch { /* ignore */ }

  // One-time trial credits — granted exactly once (guarded by the ledger reason).
  try {
    const { data: prior } = await svc.from("credit_ledger").select("id").eq("org_id", orgId).eq("reason", "trial_grant").limit(1);
    if (!prior || !prior.length) await grantCredits(orgId, TRIAL_CREDITS, "trial_grant", user.id);
  } catch { /* ignore */ }

  return { ok: true, orgId, created };
}
