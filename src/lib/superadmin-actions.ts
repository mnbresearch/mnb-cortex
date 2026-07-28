import "server-only";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { MY_BUSINESSES } from "@/lib/config";

// Plain server helpers (NOT server actions) — called from /api/superadmin.

async function assertSuper() {
  if (!(await isSuperAdmin())) throw new Error("Not authorised — platform super-admin only.");
}

/**
 * Creates the portfolio workspaces (MNB Research, Approbot) if missing and makes
 * the signed-in super-admin the owner. Creates the workspace + profile only —
 * real business figures must be imported; nothing is invented.
 */
export async function provisionBusinesses() {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error("Sign in first.");

  const created: string[] = [];
  for (const b of MY_BUSINESSES) {
    const { data: existing } = await sb.from("organizations").select("id").ilike("name", b.name).limit(1).maybeSingle();
    let orgId = (existing as any)?.id as string | undefined;
    if (!orgId) {
      const { data: row, error } = await sb.from("organizations")
        .insert({ name: b.name, industry: b.industry, currency: "INR", plan: "premium", accent: "teal" })
        .select("id").single();
      if (error) throw new Error(`Could not create ${b.name}: ${error.message}`);
      orgId = (row as any).id;
      created.push(b.name);
      // Mark my own businesses as paid so they're never trial-gated (no-op if column absent).
      try { await sb.from("organizations").update({ subscription_status: "active" }).eq("id", orgId); } catch { /* column may not exist yet */ }
    }
    const { data: mem } = await sb.from("memberships").select("id").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (!mem) await sb.from("memberships").insert({ org_id: orgId, user_id: user.id, role: "owner" });
  }
  return { ok: true, created };
}

/** Super-admin grants a person access to any organization (works pre-signup via invites). */
export async function grantOrgAccess(org_id: string, email: string, role: string) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (!org_id || !email) throw new Error("Organization and email are required.");
  const { error } = await sb.from("invites").insert({ org_id, email: email.toLowerCase(), role, status: "pending" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

const VALID_PLANS = ["starter", "growth", "premium", "enterprise"];
const VALID_STATUS = ["trialing", "active", "expired", "suspended", "cancelled"];

/**
 * Super-admin management of any customer workspace: change plan, subscription
 * status, credit balance, and trial length. All changes bypass RLS via the
 * service role and are gated by assertSuper(). Credits are handled separately
 * so the tool still works before the `credits` column migration is applied.
 */
export async function manageOrg(org_id: string, patch: {
  plan?: string;
  subscription_status?: string;
  creditsDelta?: number;
  creditsSet?: number;
  extendTrialDays?: number;
}) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (!org_id) throw new Error("Organization is required.");

  const updates: Record<string, any> = {};
  if (patch.plan) {
    if (!VALID_PLANS.includes(patch.plan)) throw new Error(`Unknown plan: ${patch.plan}`);
    updates.plan = patch.plan;
  }
  if (patch.subscription_status) {
    if (!VALID_STATUS.includes(patch.subscription_status)) throw new Error(`Unknown status: ${patch.subscription_status}`);
    updates.subscription_status = patch.subscription_status;
  }
  if (typeof patch.extendTrialDays === "number" && patch.extendTrialDays !== 0) {
    const { data } = await sb.from("organizations").select("trial_ends_at").eq("id", org_id).maybeSingle();
    const cur = (data as any)?.trial_ends_at ? new Date((data as any).trial_ends_at).getTime() : Date.now();
    const base = Math.max(cur, Date.now()); // extend from now if already expired
    updates.trial_ends_at = new Date(base + patch.extendTrialDays * 86_400_000).toISOString();
  }

  // Credits — column may not exist yet; degrade gracefully.
  let newCredits: number | undefined;
  let creditsWarning: string | undefined;
  if (typeof patch.creditsSet === "number" || typeof patch.creditsDelta === "number") {
    try {
      const { data, error } = await sb.from("organizations").select("credits").eq("id", org_id).single();
      if (error) throw error;
      const cur = Number((data as any)?.credits ?? 0);
      newCredits = typeof patch.creditsSet === "number" ? patch.creditsSet : cur + (patch.creditsDelta || 0);
      if (newCredits < 0) newCredits = 0;
      updates.credits = newCredits;
    } catch {
      creditsWarning = "The `credits` column doesn't exist yet — run the migration to manage credits.";
      newCredits = undefined;
    }
  }

  if (Object.keys(updates).length) {
    const { error } = await sb.from("organizations").update(updates).eq("id", org_id);
    if (error) throw new Error(error.message);
  }
  return { ok: true, credits: newCredits, creditsWarning };
}

/** Make the super-admin an owner of any workspace so they can view it. */
export async function joinOrg(org_id: string) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !org_id) throw new Error("Missing user or organization.");
  const { data: mem } = await sb.from("memberships").select("id").eq("org_id", org_id).eq("user_id", user.id).maybeSingle();
  if (!mem) await sb.from("memberships").insert({ org_id, user_id: user.id, role: "owner" });
  return { ok: true };
}
