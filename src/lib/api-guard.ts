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
        error: "Sign in to your workspace to use MNB Cortex AI. Start a free trial at /login.",
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
  | { ok: false; status: number; body: { ok: false; needsAuth: true; error: string } }
> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, needsAuth: true, error: "Sign in to your workspace to use this feature." },
    };
  }
  return { ok: true, userId: user.id, email: user.email || "", orgId };
}
