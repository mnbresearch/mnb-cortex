import "server-only";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { isSuperAdmin } from "@/lib/superadmin";
import { PLAN_CREDITS, creditCost } from "@/lib/config";

const RESET_DAYS = 30;

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

/** Recent credit events for a workspace (usage history). */
export async function getLedger(orgId: string, limit = 60) {
  const svc = serviceClient();
  if (!svc) return [] as any[];
  try {
    const { data } = await svc.from("credit_ledger").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
    return (data as any[]) || [];
  } catch { return []; }
}
