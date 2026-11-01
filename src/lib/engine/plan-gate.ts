/*
  MAY THIS WORKSPACE USE A PLAN CAPABILITY *RIGHT NOW*?

  planIncludes() answers "does this plan name include X". That was the only
  question anything asked, so a workspace whose Watch Pro or Command period had
  run out — and which bought a ₹149 credit pack to get back past the paywall —
  kept issuing API keys, creating webhooks and workflows, and running Autopilot
  rules, because `organizations.plan` still said what it said on the day they
  stopped paying. Credits buy metered AI work; they never bought the plan.

  The answer here is: the plan includes the capability AND the subscription is
  live (entitlement.statusOf, the same definition the paywall and the nightly
  cron use), with two narrow exceptions that exist elsewhere already:

    · credits_allowance === -1 — the operator's unlimited override
    · a Practice/Enterprise firm that is itself live and pools this client
      (credit-pool.resolvePayer, re-checked every time, never trusted)

  A suspended workspace is refused whatever else is true — suspension is a
  decision, not a clock (entitlement.isHardStopped).

  Pure, no server imports, relative ".ts" imports: scripts/test-actions-fixes.mjs
  executes every branch.
*/
import { planIncludes, lowestPlanWith, type Capability } from "../config.ts";
import { statusOf, isLapsed, isHardStopped } from "../entitlement.ts";
import { resolvePayer } from "../credit-pool.ts";

export type GateOrg = {
  id?: string | null;
  plan?: string | null;
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
  trial_ends_at?: string | null;
  autorenew_status?: string | null;
  credits_allowance?: number | null;
  practice_org_id?: string | null;
} | null | undefined;

export type CapabilityVerdict =
  | { ok: true }
  | { ok: false; reason: "plan" | "lapsed" | "suspended" };

/*
  GROUP WORKSPACES (2026-11). An Enterprise customer is a group — a holding
  company, a PE fund, a family office — and each company in it has its own
  workspace. Those workspaces are linked to the group through the same
  practice_org_id link Practice firms use (written only by
  cortex_practice_claim, which proves the caller administers the group AND
  belongs to the company), and they already share the group's credit pool.

  What they lacked was the group's FEATURES: a company workspace kept its own
  plan (usually the signup default), so the API, Autopilot, workflows and the
  rest were refused inside the very companies the group was paying for.

  A workspace inherits the GROUP's plan for capabilities, seats and integration
  limits when — and only while — it is linked to a live Enterprise group.
  Practice firms keep credit pooling only: a CA firm's clients are separate
  businesses, not one group. A group that lapses or is suspended stops lending
  its plan at once (resolvePayer re-checks it every time); the company then
  falls back to its own plan.
*/
export const GROUP_PLANS = ["enterprise"] as const;

/** The group's plan this workspace inherits right now, or null. Pure. */
export function inheritedPlan(org: GateOrg, firm?: GateOrg): string | null {
  if (!org || !firm || !firm.id || !org.id) return null;
  if (String(org.practice_org_id || "") !== String(firm.id) || String(firm.id) === String(org.id)) return null;
  const fplan = String(firm.plan || "").toLowerCase();
  if (!(GROUP_PLANS as readonly string[]).includes(fplan)) return null;
  const d = resolvePayer(
    { id: String(org.id), plan: String(org.plan || ""), status: statusOf(org) },
    { id: String(firm.id), plan: fplan, status: statusOf(firm) },
  );
  return d.pooled ? fplan : null;
}

/** The plan to read capabilities, seats and limits from: the group's when inherited, else the workspace's own. */
export function capabilityPlan(org: GateOrg, firm?: GateOrg): string {
  return inheritedPlan(org, firm) ?? String(org?.plan || "");
}

export function capabilityVerdict(org: GateOrg, cap: Capability, firm?: GateOrg): CapabilityVerdict {
  if (!org) return { ok: false, reason: "plan" };
  /* A suspension of THIS workspace is a decision about it; a group cannot lend past it. */
  if (isHardStopped(statusOf(org))) return { ok: false, reason: "suspended" };
  const lent = inheritedPlan(org, firm);
  if (lent) return planIncludes(lent, cap) ? { ok: true } : { ok: false, reason: "plan" };
  if (!planIncludes(String(org.plan || ""), cap)) return { ok: false, reason: "plan" };

  const status = statusOf(org);
  if (isHardStopped(status)) return { ok: false, reason: "suspended" };
  if (!isLapsed(status)) return { ok: true };

  /* The operator's unlimited override is a deliberate grant, not a lapse. */
  if (Number(org.credits_allowance) === -1) return { ok: true };

  /* A live firm on a pooling plan pays for this client. */
  if (firm && firm.id) {
    const d = resolvePayer(
      { id: String(org.id || ""), plan: String(org.plan || ""), status },
      { id: String(firm.id), plan: String(firm.plan || ""), status: statusOf(firm) },
    );
    if (d.pooled) return { ok: true };
  }
  return { ok: false, reason: "lapsed" };
}

/** The sentence for a refusal. Never claims anything keeps working. */
export function capabilityMessage(v: CapabilityVerdict, cap: Capability, what: string): string {
  if (v.ok) return "";
  if (v.reason === "suspended") return `${what} is unavailable while this workspace is suspended. Contact support.`;
  if (v.reason === "lapsed") return `Your plan has ended, so ${what.charAt(0).toLowerCase() + what.slice(1)} is paused. Nothing has been deleted — renew under Billing to turn it back on. (Credit packs pay for AI work; they do not renew the plan.)`;
  return `${what} is part of ${lowestPlanWith(cap)} and above — upgrade under Billing to use it.`;
}
