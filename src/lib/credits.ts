import "server-only";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { isSuperAdmin } from "@/lib/superadmin";
import { PLAN_CREDITS, creditCost, IMAGE_WEEKLY } from "@/lib/config";

const RESET_DAYS = 30;
const WEEK_MS = 7 * 86_400_000;

export type CreditState = {
  known: boolean;        // signed-in workspace?
  enforceable: boolean;  // has the metering migration been applied?
  unlimited: boolean;    // super-admin / enterprise / allowance < 0
  balance: number;
  allowance: number;     // monthly included credits (-1 = unlimited)
  plan: string;
  resetAt: string | null;
};

export type ChargeResult = { ok: boolean; enforced: boolean; cost: number; balance: number };

function planAllowance(plan: string, override?: number | null): number {
  // 0 / null → use the plan default; -1 → unlimited; any positive → explicit override.
  if (typeof override === "number" && override !== 0) return override;
  return PLAN_CREDITS[plan] ?? 500;
}

/** Full credit state for the active workspace. Applies the monthly allowance top-up if due. */
export async function getCreditState(): Promise<CreditState> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) {
    return { known: false, enforceable: false, unlimited: true, balance: 0, allowance: 0, plan: "growth", resetAt: null };
  }
  const superAdmin = await isSuperAdmin();
  const sb = createClient();
  try {
    const { data, error } = await sb.from("organizations")
      .select("plan, credits, credits_allowance, credits_reset_at").eq("id", orgId).single();
    if (error) throw error;
    const plan = String((data as any).plan || "growth").toLowerCase();
    const allowance = planAllowance(plan, (data as any).credits_allowance);
    const unlimited = superAdmin || plan === "enterprise" || allowance < 0;
    let balance = Number((data as any).credits ?? 0);
    let resetAt: string | null = (data as any).credits_reset_at ?? null;

    if (!unlimited && allowance > 0) {
      const svc = serviceClient();
      if (svc) {
        try {
          const { data: nb, error: rpcErr } = await svc.rpc("sync_allowance", { p_org: orgId, p_amount: allowance, p_days: RESET_DAYS });
          if (!rpcErr && typeof nb === "number") {
            balance = nb;
            // reflect the advanced reset date
            const { data: fresh } = await svc.from("organizations").select("credits_reset_at").eq("id", orgId).single();
            resetAt = (fresh as any)?.credits_reset_at ?? resetAt;
          }
        } catch { /* rpc missing — leave balance as read */ }
      }
    }
    return { known: true, enforceable: true, unlimited, balance, allowance, plan, resetAt };
  } catch {
    // credits columns not migrated yet → metering inactive, never blocks
    return { known: true, enforceable: false, unlimited: true, balance: 0, allowance: 0, plan: "growth", resetAt: null };
  }
}

/**
 * Charge the active workspace for one AI action BEFORE running the model.
 * Migration-safe: if the columns/RPCs don't exist, or there's no service role,
 * enforcement is OFF and the call is always allowed.
 */
export async function chargeForMode(mode: string): Promise<ChargeResult> {
  const cost = creditCost(mode);
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { ok: true, enforced: false, cost, balance: 0 };

  const svc = serviceClient();
  if (!svc) return { ok: true, enforced: false, cost, balance: 0 };

  try {
    const superAdmin = await isSuperAdmin();
    const { data: org, error } = await svc.from("organizations").select("plan, credits_allowance").eq("id", orgId).single();
    if (error) return { ok: true, enforced: false, cost, balance: 0 };
    const plan = String((org as any)?.plan || "growth").toLowerCase();
    const allowance = planAllowance(plan, (org as any)?.credits_allowance);
    if (superAdmin || plan === "enterprise" || allowance < 0) return { ok: true, enforced: false, cost, balance: -1 };

    if (allowance > 0) { try { await svc.rpc("sync_allowance", { p_org: orgId, p_amount: allowance, p_days: RESET_DAYS }); } catch {} }

    const { data: nb, error: rpcErr } = await svc.rpc("charge_credits", {
      p_org: orgId, p_amount: cost, p_user: user.id, p_reason: "ai:" + String(mode || "").toLowerCase(), p_meta: {},
    });
    if (rpcErr) return { ok: true, enforced: false, cost, balance: 0 }; // rpc missing → allow

    const bal = Number(nb);
    if (bal < 0) {
      const { data: cur } = await svc.from("organizations").select("credits").eq("id", orgId).single();
      return { ok: false, enforced: true, cost, balance: Number((cur as any)?.credits ?? 0) };
    }
    return { ok: true, enforced: true, cost, balance: bal };
  } catch {
    return { ok: true, enforced: false, cost, balance: 0 };
  }
}

/** Add credits to a workspace via the audited RPC (used by top-up + super-admin). */
export async function grantCredits(orgId: string, amount: number, reason: string, userId?: string | null): Promise<number> {
  const svc = serviceClient();
  if (!svc) throw new Error("Service role not configured.");
  const { data, error } = await svc.rpc("grant_credits", {
    p_org: orgId, p_amount: Math.round(amount), p_user: userId ?? null, p_reason: reason, p_meta: {},
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export type ImageGate = { allowed: boolean; used: number; limit: number; plan: string; active: boolean; reason?: string };

/**
 * Premium gate for image generation. Trial workspaces get a small weekly taste,
 * then must buy. Suspended/expired are blocked. Fails CLOSED on any doubt so the
 * paid image model can't be abused by free users.
 */
export async function imageGenGate(): Promise<ImageGate> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { allowed: false, used: 0, limit: 0, plan: "none", active: false, reason: "Sign in to a workspace to use image agents." };
  const superAdmin = await isSuperAdmin();
  const svc = serviceClient();
  if (!svc) return { allowed: false, used: 0, limit: 0, plan: "none", active: false, reason: "Image generation is temporarily unavailable." };
  try {
    const { data: org, error } = await svc.from("organizations").select("plan, subscription_status").eq("id", orgId).single();
    if (error) throw error;
    const plan = String((org as any)?.plan || "growth").toLowerCase();
    const status = String((org as any)?.subscription_status || "trialing");
    if (superAdmin || plan === "enterprise") return { allowed: true, used: 0, limit: -1, plan, active: true };
    if (["suspended", "cancelled", "expired"].includes(status)) {
      return { allowed: false, used: 0, limit: 0, plan, active: false, reason: "Your plan is inactive. Reactivate a paid plan to use image agents." };
    }
    const active = status === "active";
    const limit = active ? (IMAGE_WEEKLY[plan] ?? IMAGE_WEEKLY.starter) : IMAGE_WEEKLY.trial;
    if (limit < 0) return { allowed: true, used: 0, limit: -1, plan, active };

    const since = new Date(Date.now() - WEEK_MS).toISOString();
    const { count, error: cErr } = await svc.from("credit_ledger")
      .select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("reason", "ai:agent_image").gte("created_at", since);
    if (cErr) throw cErr;
    const used = count || 0;
    if (used >= limit) {
      return {
        allowed: false, used, limit, plan, active,
        reason: active
          ? `You've used all ${limit} image generations on your ${plan} plan this week. Upgrade for a higher limit.`
          : `You've used your ${limit} free image generations for this week. Buy a plan to keep generating — free access is limited on purpose.`,
      };
    }
    return { allowed: true, used, limit, plan, active };
  } catch {
    // Fail closed — never let the paid image model run when we can't verify entitlement.
    return { allowed: false, used: 0, limit: 0, plan: "unknown", active: false, reason: "Couldn't verify your image quota. Please try again shortly." };
  }
}

/** Recent credit events for a workspace (usage history). */
export async function getLedger(orgId: string, limit = 60) {
  const svc = serviceClient();
  if (!svc) return [] as any[];
  try {
    const { data } = await svc.from("credit_ledger").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
    return (data as any[]) || [];
  } catch { return []; }
}
