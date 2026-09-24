import "server-only";
import { TRIAL_DAYS } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { isLocked } from "@/lib/paywall";
import { isHardStopped } from "@/lib/entitlement";
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
  /**
   * The CA firm paying for this workspace under Practice pooling, if any.
   *
   * Surfaced rather than kept internal because "you are covered by your firm"
   * is the sentence that stops a client owner ringing us about a plan they were
   * never asked to buy — and because an unexplained unlock is as confusing as
   * an unexplained lock.
   */
  pooledBy: string | null;
};

/**
 * Computes trial/subscription state for the active workspace.
 * Migration-safe: if the trial columns don't exist yet, enforcement is OFF
 * (locked=false) so nobody is locked out before the migration runs.
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) {
    return { known: false, enforceable: false, status: "trialing", daysLeft: TRIAL_DAYS, trialEndsAt: null, subscriptionEndsAt: null, lapsedSubscription: false, plan: "starter", locked: false, credits: 0, pooledBy: null };
  }
  const sb = await createClient();

  // Try the full read (needs the migration). Fall back to created_at only.
  let enforceable = true;
  let subStatus = "trialing";
  let plan = "starter";
  let created: number | null = null;
  let trialEnd: number | null = null;
  let subEnd: number | null = null;
  let credits = 0;
  let unlimited = false;
  /** Set when this workspace is claimed by a CA firm under Practice pooling. */
  let practiceOrgId: string | null = null;

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
    practiceOrgId = (data as any).practice_org_id || null;
  } catch {
    enforceable = false;
    try {
      const { data } = await sb.from("organizations").select("created_at, plan").eq("id", orgId).single();
      plan = (data as any)?.plan || "starter";
      created = (data as any)?.created_at ? new Date((data as any).created_at).getTime() : null;
      trialEnd = created ? created + TRIAL_DAYS * DAY : null;
    } catch { /* leave defaults */ }
  }

  /*
    ============================================================================
    PRACTICE POOLING — the paywall did not know about it, and the meter did.
    ============================================================================

    lib/credits.ts getCreditState() resolves practice_org_id and reports the
    FIRM's balance for a claimed client. Its comment says, in as many words:

        "The paywall reads this same state (lib/paywall isLocked), so reporting
         the client's own empty balance would also lock a workspace the firm is
         paying for."

    The paywall does not read that state. It read this org's row and nothing
    else. And cortex_practice_claim only writes the link — a claimed client
    keeps its own plan and its own subscription_status, which for a
    firm-provisioned workspace is typically `starter`, expired, 0 credits.

    So: isLocked() true, and layout.tsx puts a full-screen TrialGuard over every
    page except the eight allow-listed ones. The firm is paying ₹29,999 a month
    for up to 25 client workspaces, the pooled-credit banner inside shows a
    healthy balance, and the client cannot open a single screen. That is the
    Practice plan failing at its own front door, and the only reason it has not
    been reported is that nobody has sold one yet.

    resolvePayer() is reused rather than reimplemented — it already refuses to
    pool for a firm that is not on a pooling plan or is itself lapsed, so this
    can only ever unlock a workspace somebody is genuinely paying for.

    ON A FAILED FIRM READ we keep the client's own state, which means locked.
    That matches getCreditState's own catch, and the asymmetry is deliberate: a
    transient error briefly locking a paying customer is a support ticket, while
    the same error unlocking a non-paying one is revenue. Consistency between
    the two functions is the thing that was missing in the first place.
  */
  let payerStatus = subStatus;
  let payerPlan = plan;
  let payerCredits = credits;
  let payerUnlimited = unlimited;
  let pooledBy: string | null = null;

  if (enforceable && practiceOrgId && practiceOrgId !== orgId) {
    try {
      const { serviceClient } = await import("@/lib/supabase/server");
      const { resolvePayer } = await import("@/lib/credit-pool");
      const svc = serviceClient();
      if (svc) {
        const { data: firmRow } = await svc.from("organizations").select("*").eq("id", practiceOrgId).single();
        if (firmRow) {
          const decision = resolvePayer(
            { id: orgId, plan, status: subStatus },
            { id: String((firmRow as any).id), plan: String((firmRow as any).plan || ""), status: String((firmRow as any).subscription_status || "") },
          );
          if (decision.pooled) {
            payerStatus = String((firmRow as any).subscription_status || "trialing");
            payerPlan = String((firmRow as any).plan || plan);
            payerCredits = Number((firmRow as any).credits ?? 0);
            payerUnlimited = (firmRow as any).credits_allowance === -1;
            pooledBy = String((firmRow as any).id);
            /* The dates that decide `status` below belong to the payer too —
               otherwise a covered client still reads as an expired trial. */
            subEnd = (firmRow as any).subscription_ends_at ? new Date((firmRow as any).subscription_ends_at).getTime() : null;
            trialEnd = (firmRow as any).trial_ends_at ? new Date((firmRow as any).trial_ends_at).getTime() : trialEnd;
          }
        }
      }
    } catch { /* keep this workspace's own state — see the note above */ }
  }

  subStatus = payerStatus;
  plan = payerPlan;
  credits = payerCredits;
  unlimited = payerUnlimited;

  const now = Date.now();

  /*
    A super-admin can hard-block a customer regardless of any timing — and this
    must name the SAME statuses as isHardStopped() in entitlement.ts, or the UI
    locks people the server would serve (or the reverse). `cancelled` is
    deliberately not here: a churned workspace that buys a credit pack has to be
    able to spend it, which is the whole point of /usage staying reachable.
  */
  const blocked = isHardStopped(subStatus);

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
  const locked = isLocked({ enforceable, status, blocked, credits, unlimited });

  return {
    known: true, enforceable, status, daysLeft,
    trialEndsAt: trialEnd ? new Date(trialEnd).toISOString() : null,
    subscriptionEndsAt: subEnd ? new Date(subEnd).toISOString() : null,
    lapsedSubscription,
    plan, locked, credits, pooledBy,
  };
}
