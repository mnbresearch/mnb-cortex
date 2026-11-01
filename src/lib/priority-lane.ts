/*
  THE PRIORITY LANE — top plans are handled first, every day.

  The nightly autopilot rotates over every workspace with fixed time shares, so
  a workspace waits its turn whatever it pays: collections reach about ten
  workspaces a night, the nightly watch a few dozen. For a ₹59,999 Command
  customer — or an Enterprise group with twenty companies — that meant waiting
  days between runs, the opposite of what the top plans sell.

  /api/cron/priority runs once a day, in business hours, with its own 300s
  budget, ONLY for these workspaces: their nightly watch, their collections
  reminders and their data sync. It does not take time from anyone else's
  lane, and every step it runs is already idempotent (the watch skips invoices
  reminded in the last 7 days; collections enforces its own caps, gaps and
  quiet hours), so a workspace that is also reached by the nightly run is not
  messaged twice.

  Pure, relative ".ts" imports, so scripts/test-priority-lane.mjs executes it.
*/
import { statusOf, isLapsed, isHardStopped } from "./entitlement.ts";
import { inheritedPlan, type GateOrg } from "./engine/plan-gate.ts";

/** Highest first. A plan not listed is not in the lane. */
export const PRIORITY_PLANS = ["enterprise", "command", "aicoo", "practice"] as const;

export function priorityRank(plan: string | null | undefined): number {
  const i = (PRIORITY_PLANS as readonly string[]).indexOf(String(plan || "").toLowerCase());
  return i < 0 ? -1 : PRIORITY_PLANS.length - i;
}

export type LaneOrg = NonNullable<GateOrg> & { created_at?: string | null };

/**
 * Which workspaces the lane serves, best first: live top-plan workspaces, and
 * companies of a live Enterprise group (ranked as Enterprise). Lapsed or
 * suspended workspaces are never in it.
 */
export function selectPriority(orgs: LaneOrg[], firmsById: Map<string, LaneOrg>, max = 200): string[] {
  const picked: { id: string; rank: number; at: string }[] = [];
  for (const o of orgs) {
    if (!o?.id) continue;
    const status = statusOf(o);
    if (isHardStopped(status)) continue;
    const firm = o.practice_org_id ? firmsById.get(String(o.practice_org_id)) || null : null;
    const lent = inheritedPlan(o, firm);
    const plan = lent ?? String(o.plan || "");
    if (!lent && isLapsed(status)) continue;
    const rank = priorityRank(plan);
    if (rank < 0) continue;
    picked.push({ id: String(o.id), rank, at: String(o.created_at || "") });
  }
  picked.sort((a, b) => b.rank - a.rank || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return picked.slice(0, Math.max(0, max)).map((p) => p.id);
}

/* Shares of the lane's own 300s function (20s kept in reserve). */
export const PRIORITY_SHARE = { sync: 60_000, watch: 90_000, collections: 120_000 } as const;
