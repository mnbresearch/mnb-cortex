import "server-only";
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
  cost: number;
  balance: number;
};

/**
 * Turn a failed chargeForMode() into an HTTP status + body.
 * 401 for "you aren't signed in", 402 for "you're out of credits".
 */
export function creditDenial(gate: ChargeResult, action = "This action"): { status: number; body: DenialBody } {
  if (gate.reason === "anonymous") {
    return {
      status: 401,
      body: {
        ok: false, needsAuth: true, cost: gate.cost, balance: 0,
        error: "Sign in to your workspace to use MNB Cortex AI — a ₹149 credit pack is enough to start.",
      },
    };
  }
  if (gate.reason === "lapsed") {
    // Distinct from "out of credits": topping up would not help, because the
    // subscription period itself has ended. Send them to /billing, not /usage.
    return {
      status: 402,
      body: {
        ok: false, planExpired: true, cost: gate.cost, balance: 0,
        error: "Your MNB Cortex plan has ended, so this is paused. Your workspace and data are exactly as you left them — renew under Billing and everything comes straight back.",
      },
    };
  }
  return {
    status: 402,
    body: {
      ok: false, outOfCredits: true, cost: gate.cost, balance: gate.balance,
      error: `You're out of AI credits. ${action} costs ${gate.cost} credit${gate.cost === 1 ? "" : "s"} and your balance is ${gate.balance}. Top up under Usage & Credits.`,
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
