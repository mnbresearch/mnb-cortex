import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

const TRIAL_DAYS = 3;
const DAY = 86_400_000;

export type BillingStatus = {
  known: boolean;          // is there a logged-in workspace?
  enforceable: boolean;    // has the trial migration been applied?
  status: "trialing" | "active" | "expired";
  daysLeft: number;
  trialEndsAt: string | null;
  /** End of the current PAID period (null when on trial or never paid). */
  subscriptionEndsAt: string | null;
  /** True when the lapse is a paid plan running out, not a trial ending. */
  lapsedSubscription: boolean;
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
    return { known: false, enforceable: false, status: "trialing", daysLeft: TRIAL_DAYS, trialEndsAt: null, subscriptionEndsAt: null, lapsedSubscription: false, plan: "growth", locked: false };
  }
  const sb = createClient();

  // Try the full read (needs the migration). Fall back to created_at only.
  let enforceable = true;
  let subStatus = "trialing";
  let plan = "growth";
  let created: number | null = null;
  let trialEnd: number | null = null;
  let subEnd: number | null = null;

  try {
    const { data, error } = await sb.from("organizations")
      .select("created_at, plan, trial_ends_at, subscription_status, subscription_ends_at").eq("id", orgId).single();
    if (error) throw error;
    subStatus = (data as any).subscription_status || "trialing";
    plan = (data as any).plan || "growth";
    created = (data as any).created_at ? new Date((data as any).created_at).getTime() : null;
    trialEnd = (data as any).trial_ends_at ? new Date((data as any).trial_ends_at).getTime() : (created ? created + TRIAL_DAYS * DAY : null);
    subEnd = (data as any).subscription_ends_at ? new Date((data as any).subscription_ends_at).getTime() : null;
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

  // A super-admin can hard-block a customer regardless of any timing.
  const blocked = subStatus === "suspended" || subStatus === "cancelled";

  // A paid plan runs out at the end of the period it was bought for. The nightly
  // cron flips the row to 'expired', but we evaluate it live too so the paywall
  // is correct the moment the period ends rather than at the next cron run.
  const lapsedSubscription = subStatus === "active" && subEnd !== null && now > subEnd;
  const paidAndCurrent = subStatus === "active" && !lapsedSubscription;

  let status: BillingStatus["status"] = paidAndCurrent
    ? "active"
    : (lapsedSubscription || (trialEnd && now > trialEnd) ? "expired" : "trialing");
  if (blocked) status = "expired";

  // Countdown shown to the user: days left on the paid period when subscribed,
  // otherwise days left on the trial.
  const daysLeft = paidAndCurrent && subEnd
    ? Math.max(0, Math.ceil((subEnd - now) / DAY))
    : (trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / DAY)) : TRIAL_DAYS);

  const locked = enforceable && (blocked || status === "expired");

  return {
    known: true, enforceable, status, daysLeft,
    trialEndsAt: trialEnd ? new Date(trialEnd).toISOString() : null,
    subscriptionEndsAt: subEnd ? new Date(subEnd).toISOString() : null,
    lapsedSubscription,
    plan, locked,
  };
}
