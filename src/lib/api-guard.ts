import "server-only";
import { SMALLEST_PACK_LABEL } from "@/lib/config";
import { getUserAndOrg } from "@/lib/data";
import type { ChargeResult } from "@/lib/credits";

/**
 * Shared guards for API routes.
 *
 * Every billable endpoint answers refusals in ONE shape so the client can react
 * consistently: `needsAuth` → send them to /login, `outOfCredits` → send them to
 * /usage to top up.
 */

export type DenialBody = {
  ok: false;
  error: string;
  needsAuth?: boolean;
  outOfCredits?: boolean;
  planExpired?: boolean;
  /** Metering could not be performed (credits.ts reason "unavailable"): 503, retry. */
  creditsUnavailable?: boolean;
  cost: number;
  balance: number;
};

/**
 * Turn a failed chargeForMode() into an HTTP status + body.
 * 401 for "you aren't signed in", 402 for "out of credits" / "no live plan",
 * 503 for "credits could not be checked" (nothing charged; retry).
 */
export function creditDenial(gate: ChargeResult, action = "This action"): { status: number; body: DenialBody } {
  /*
    "own-key" means the workspace supplied its own provider key, so the call
    succeeded and cost nothing — it is an ok:true reason, not a denial.
    Unreachable today, because every caller checks `!gate.ok` first. Kept
    because the failure mode if that ever changes is telling a customer who
    brought their own key that they are out of credits, which is both wrong and
    exactly the sort of billing message that loses an enterprise account.
  */
  if (gate.ok || gate.reason === "own-key") {
    /* A success. Shaped as one — ok:true and no `error`, because a client that
       reads `error` would render a failure for a call that worked. */
    return { status: 200, body: { ok: true, cost: 0, balance: gate.balance } as unknown as DenialBody };
  }
  if (gate.reason === "anonymous") {
    return {
      status: 401,
      body: {
        ok: false, needsAuth: true, cost: gate.cost, balance: 0,
        error: `Sign in to your workspace to use MNB Cortex AI — a ${SMALLEST_PACK_LABEL} credit pack is enough to start.`,
      },
    };
  }
  if (gate.reason === "unavailable") {
    /*
      METERING ITSELF FAILED (credits.ts: charge_credits errored or threw).
      Nothing was debited and the action did not run. This used to fall through
      to the out-of-credits branch below, telling a customer with a full balance
      "you're out of credits" over our own database fault — a 503 with a
      retry is the true answer.
    */
    return {
      status: 503,
      body: {
        ok: false, creditsUnavailable: true, cost: gate.cost, balance: gate.balance,
        error: "Credits could not be checked right now — nothing was charged. Please try again.",
      },
    };
  }
  if (gate.reason === "lapsed") {
    /*
      What credits.ts calls "lapsed" is: no live plan funding this workspace
      (its own, or the Practice firm's when pooled) AND fewer credits than this
      costs — or an operator suspension. It is NOT always "your plan has
      ended": a workspace that never subscribed is `expired` from its first
      second, and a pooled client's plan is the firm's. Buying credits DOES
      help (except under a suspension), so the copy must not say otherwise.
      Sent to /billing, not /usage.
    */
    return {
      status: 402,
      body: {
        ok: false, planExpired: true, cost: gate.cost, balance: gate.balance,
        error: "There's no active MNB Cortex plan behind this workspace right now, and not enough credits for this, so it's paused. Your workspace and data are exactly as you left them — see Billing to choose a plan or add credits.",
      },
    };
  }
  if (gate.reason === "insufficient") {
    const n = `${gate.cost} credit${gate.cost === 1 ? "" : "s"}`;
    /* For a pooled client the balance that ran out is the Practice firm's, and
       only the firm can top it up — "your balance is 0" would send the client
       to a Usage page that cannot fix it. */
    return {
      status: 402,
      body: {
        ok: false, outOfCredits: true, cost: gate.cost, balance: gate.balance,
        error: gate.pooledFor
          ? `Your practice's shared AI credits have run out. ${action} costs ${n} and the shared balance is ${gate.balance}. Ask your practice to top up under Usage & Credits.`
          : `You're out of AI credits. ${action} costs ${n} and your balance is ${gate.balance}. Top up under Usage & Credits.`,
      },
    };
  }
  /* A refusal with no reason we recognise: we do not know it was the balance,
     so we do not say it was. Nothing was charged on any refusal path. */
  return {
    status: 503,
    body: {
      ok: false, creditsUnavailable: true, cost: gate.cost, balance: gate.balance,
      error: "Credits could not be checked right now — nothing was charged. Please try again.",
    },
  };
}

/**
 * Require a signed-in user with an active workspace.
 * Returns the identity, or a denial body for routes that aren't credit-metered.
 */
export async function requireWorkspace(): Promise<
  | { ok: true; userId: string; email: string; orgId: string }
  | { ok: false; status: number; body: { ok: false; needsAuth?: true; planExpired?: true; error: string } }
> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, needsAuth: true, error: "Sign in to your workspace to use this feature." },
    };
  }

  // Entitlement, server-side. The non-metered features (exports, integrations,
  // scheduled reports, outbound webhooks) cost us little to run but ARE the
  // product, and until now a lapsed workspace kept every one of them — the only
  // barrier was a client-side overlay.
  //
  // Fails OPEN on any error: a transient database problem must never lock out a
  // paying customer. It refuses only when the row was read and clearly says the
  // plan is over.
  try {
    const { serviceClient } = await import("@/lib/supabase/server");
    const { statusOf, isLapsed } = await import("@/lib/credits");
    const svc = serviceClient();
    if (svc) {
      const { data, error } = await svc.from("organizations").select("*").eq("id", orgId).single();
      if (!error && data) {
        const status = statusOf(data);
        // Bought credits count as entitlement — see chargeForMode(). Without
        // this, a ₹149 pay-as-you-go customer would be refused every
        // non-metered feature (exports, integrations, reports) despite paying.
        const hasCredits = Number((data as any).credits ?? 0) > 0;
        if (isLapsed(status) && !hasCredits) {
          return {
            ok: false,
            status: 402,
            body: {
              ok: false,
              planExpired: true,
              error: "Your MNB Cortex plan has ended, so this is paused. Nothing has been deleted — renew under Billing and it all comes back.",
            },
          };
        }
      }
    }
  } catch { /* fail open — never lock out a paying customer over an error */ }

  return { ok: true, userId: user.id, email: user.email || "", orgId };
}
