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

  // Already in a workspace? Nothing to do.
  const { data: mems } = await svc.from("memberships").select("org_id").eq("user_id", user.id).limit(1);
  if (mems && mems.length) return { ok: true, orgId: (mems[0] as any).org_id, created: false };

  const meta: any = user.user_metadata || {};
  const name = String(opts?.name || meta.company || meta.full_name || (user.email || "").split("@")[0] || "My workspace").slice(0, 80);

  const { data: org, error } = await svc.from("organizations")
    .insert({ name, industry: opts?.industry || meta.industry || null, currency: "INR", plan: "growth", accent: "teal" })
    .select("id").single();
  if (error || !org) return { ok: false, error: error?.message || "Could not create your workspace." };
  const orgId = (org as any).id as string;

  await svc.from("memberships").insert({ org_id: orgId, user_id: user.id, role: "owner" });

  // Trial window + status (migration-safe — columns may not exist on older DBs).
  try {
    await svc.from("organizations").update({
      subscription_status: "trialing",
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
    }).eq("id", orgId);
  } catch { /* ignore */ }

  // Profile row (best-effort).
  try { await svc.from("profiles").upsert({ id: user.id, full_name: meta.full_name || null }); } catch { /* ignore */ }

  // One-time trial credits.
  try { await grantCredits(orgId, TRIAL_CREDITS, "trial_grant", user.id); } catch { /* ignore */ }

  return { ok: true, orgId, created: true };
}
