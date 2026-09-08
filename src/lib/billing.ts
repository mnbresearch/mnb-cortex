import "server-only";
import { TRIAL_DAYS } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

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
  /** Credits the workspace can still spend. Bought credits ARE an entitlement. */
  credits: number;
};

/**
 * Computes trial/subscription state for the active workspace.
 * Migration-safe: if the trial columns don't exist yet, enforcement is OFF
 * (locked=false) so nobody is locked out before the migration runs.
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) {
    return { known: false, enforceable: false, status: "trialing", daysLeft: TRIAL_DAYS, trialEndsAt: null, subscriptionEndsAt: null, lapsedSubscription: false, plan: "starter", locked: false, credits: 0 };
  }
  const sb = createClient();

  // Try the full read (needs the migration). Fall back to created_at only.
  let enforceable = true;
  let subStatus = "trialing";
  let plan = "starter";
  let created: number | null = null;
  let trialEnd: number | null = null;
  let subEnd: number | null = null;
  let credits = 0;
  let unlimited = false;

  try {
    // select("*") deliberately: naming subscription_ends_at explicitly would make
    // this query fail on a database that hasn't run 2026_hardening.sql yet, and
    // the catch below switches enforcement OFF — which would silently disable the
    // trial paywall until the migration lands.
    const { data, error } = await sb.from("organizations").select("*").eq("id", orgId).single();
    if (error) throw error;
    subStatus = (data as any).subscription_status || "trialing";
    plan = (data as any).plan || "starter";
    created = (data as any).created_at ? new Date((data as any).created_at).getTime() : null;
    trialEnd = (data as any).trial_ends_at ? new Date((data as any).trial_ends_at).getTime() : (created ? created + TRIAL_DAYS * DAY : null);
    subEnd = (data as any).subscription_ends_at ? new Date((data as any).subscription_ends_at).getTime() : null;
    credits = Number((data as any).credits ?? 0);
    unlimited = (data as any).credits_allowance === -1;
  } catch {
    enforceable = false;
    try {
      const { data } = await sb.from("organizations").select("created_at, plan").eq("id", orgId).single();
      plan = (data as any)?.plan || "starter";
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
  //
  // An active workspace with NO recorded end date never expires (a manual grant,
  // or a customer from before periods existed). It must NOT fall through to the
  // long-past trial date, or every such customer would see "your plan ends
  // today" forever — so report a large number instead.
  const NEVER = 36_500; // ~100 years
  const daysLeft = paidAndCurrent
    ? (subEnd ? Math.max(0, Math.ceil((subEnd - now) / DAY)) : NEVER)
    : (trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / DAY)) : TRIAL_DAYS);

  /*
    THE PAYWALL AND THE METER DISAGREED, AND THE PAYWALL WON.

    lib/credits.ts has a deliberate pay-as-you-go path: a workspace that is
    lapsed but holds credits is allowed to spend them, because there is no free
    trial and a brand-new workspace is `expired` from its first second — so
    bought credits ARE the entitlement. The comment there says exactly that.

    This function ignored the balance entirely. So someone who bought the ₹149
    Taster pack the landing page advertises got a server that would happily meter
    their credits and a UI that covered every page with a full-screen lock. They
    had paid, and could not see what they paid for. /billing then told them to
    "start with a ₹149 credit pack" — which they had just done.

    Two rules, matching the meter:

    - `blocked` (an operator set suspended/cancelled) locks REGARDLESS of
      balance. That is the point of the lever, and it is now true on both sides
      rather than only in the copy.
    - an expired trial or a lapsed plan locks only when there is nothing left to
      spend. Credits, or an unlimited allowance override, keep the product open.

    Anyone locked here genuinely has no plan and no credits.
  */
  const hasSpendableCredits = unlimited || credits > 0;
  const locked = enforceable && (blocked || (status === "expired" && !hasSpendableCredits));

  return {
    known: true, enforceable, status, daysLeft,
    trialEndsAt: trialEnd ? new Date(trialEnd).toISOString() : null,
    subscriptionEndsAt: subEnd ? new Date(subEnd).toISOString() : null,
    lapsedSubscription,
    plan, locked, credits,
  };
}
