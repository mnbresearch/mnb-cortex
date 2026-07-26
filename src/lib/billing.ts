import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

const TRIAL_DAYS = 14;
const DAY = 86_400_000;

export type BillingStatus = {
  known: boolean;          // is there a logged-in workspace?
  enforceable: boolean;    // has the trial migration been applied?
  status: "trialing" | "active" | "expired";
  daysLeft: number;
  trialEndsAt: string | null;
  plan: string;
  locked: boolean;         // must upgrade to continue
};

/**
 * Computes trial/subscription state for the active workspace.
 * Migration-safe: if the trial columns don't exist yet, enforcement is OFF
 * (locked=false) so nobody is locked out before the migration runs.
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) {
    return { known: false, enforceable: false, status: "trialing", daysLeft: TRIAL_DAYS, trialEndsAt: null, plan: "growth", locked: false };
  }
  const sb = createClient();

  // Try the full read (needs the migration). Fall back to created_at only.
  let enforceable = true;
  let subStatus = "trialing";
  let plan = "growth";
  let created: number | null = null;
  let trialEnd: number | null = null;

  try {
    const { data, error } = await sb.from("organizations")
      .select("created_at, plan, trial_ends_at, subscription_status").eq("id", orgId).single();
    if (error) throw error;
    subStatus = (data as any).subscription_status || "trialing";
    plan = (data as any).plan || "growth";
    created = (data as any).created_at ? new Date((data as any).created_at).getTime() : null;
    trialEnd = (data as any).trial_ends_at ? new Date((data as any).trial_ends_at).getTime() : (created ? created + TRIAL_DAYS * DAY : null);
  } catch {
    enforceable = false;
    try {
      const { data } = await sb.from("organizations").select("created_at, plan").eq("id", orgId).single();
      plan = (data as any)?.plan || "growth";
      created = (data as any)?.created_at ? new Date((data as any).created_at).getTime() : null;
      trialEnd = created ? created + TRIAL_DAYS * DAY : null;
    } catch { /* leave defaults */ }
  }

  const now = Date.now();
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / DAY)) : TRIAL_DAYS;
  const status: BillingStatus["status"] = subStatus === "active" ? "active" : (trialEnd && now > trialEnd ? "expired" : "trialing");
  const locked = enforceable && status === "expired";

  return { known: true, enforceable, status, daysLeft, trialEndsAt: trialEnd ? new Date(trialEnd).toISOString() : null, plan, locked };
}
