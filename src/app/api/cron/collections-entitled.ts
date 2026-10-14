/*
  MAY THIS WORKSPACE'S COLLECTIONS REMINDERS GO OUT TODAY?

  Collections was the one per-workspace lane in the nightly cron that ignored
  entitlement entirely — a workspace whose plan had lapsed kept drafting and
  sending dunning to its debtors. Both scheduled send paths (the nightly
  autopilot and the daytime send in the reconcile cron) now ask this.

  The rule is the paywall's (statusOf / isLapsed), plus the two exceptions the
  plan gate already honours (lib/engine/plan-gate.ts): the operator's unlimited
  override (credits_allowance = -1), and a Practice firm on a pooling plan that
  pays for this client. A suspended (hard-stopped) workspace never sends.

  Pure, relative ".ts" imports, so scripts/ can execute it.
*/
import { statusOf, isLapsed, isHardStopped } from "../../../lib/entitlement.ts";
import { resolvePayer } from "../../../lib/credit-pool.ts";

export type CollectionsOrg = {
  id?: string | null;
  plan?: string | null;
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
  trial_ends_at?: string | null;
  autorenew_status?: string | null;
  credits_allowance?: number | null;
  practice_org_id?: string | null;
} | null | undefined;

/** Columns the rule needs — select exactly these. */
export const COLLECTIONS_ORG_COLUMNS =
  "id,plan,subscription_status,subscription_ends_at,trial_ends_at,autorenew_status,credits_allowance,practice_org_id";

export function collectionsEntitled(org: CollectionsOrg, firm?: CollectionsOrg): boolean {
  if (!org) return false;
  const status = statusOf(org);
  if (isHardStopped(status)) return false;
  if (!isLapsed(status)) return true;
  if (Number(org.credits_allowance) === -1) return true;
  if (firm && firm.id) {
    const d = resolvePayer(
      { id: String(org.id || ""), plan: String(org.plan || ""), status },
      { id: String(firm.id), plan: String(firm.plan || ""), status: statusOf(firm) },
    );
    if (d.pooled) return true;
  }
  return false;
}

/**
 * Decide for many workspaces with one read per 100 ids (plus their firms).
 * A read error returns `error` and decides nobody — callers skip sending
 * rather than send for a workspace they could not check.
 */
export async function collectionsEntitledSet(svc: any, orgIds: string[]): Promise<{ allowed: Set<string>; error: string | null }> {
  const allowed = new Set<string>();
  const ids = Array.from(new Set(orgIds.filter(Boolean)));
  const byId = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await svc.from("organizations").select(COLLECTIONS_ORG_COLUMNS).in("id", ids.slice(i, i + 100));
    if (error) return { allowed: new Set(), error: String(error.message || error) };
    for (const o of (data as any[]) || []) byId.set(String(o.id), o);
  }
  const firmIds = Array.from(new Set(Array.from(byId.values())
    .map((o) => String(o.practice_org_id || "")).filter((f) => f && !byId.has(f))));
  for (let i = 0; i < firmIds.length; i += 100) {
    const { data, error } = await svc.from("organizations").select(COLLECTIONS_ORG_COLUMNS).in("id", firmIds.slice(i, i + 100));
    if (error) return { allowed: new Set(), error: String(error.message || error) };
    for (const o of (data as any[]) || []) byId.set(String(o.id), o);
  }
  for (const id of ids) {
    const org = byId.get(id);
    const firm = org?.practice_org_id ? byId.get(String(org.practice_org_id)) : null;
    if (collectionsEntitled(org, firm)) allowed.add(id);
  }
  return { allowed, error: null };
}
