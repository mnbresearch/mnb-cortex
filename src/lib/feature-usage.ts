import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { FEATURES, gateInfo, suggestFor, type Feature } from "@/lib/feature-atlas";
import type { AtlasRow } from "@/components/feature-atlas";

/*
  Which metered features this workspace has used in the last 90 days, read
  from the funnel's `feature_used` events (lib/credits.ts records one per
  successful AI charge, mode name only). Service role: funnel_events is not
  readable by the browser.

  Honest limit, said where it is shown: the events exist from 6.45 (October
  2026), so older use is not counted — the UI says "used recently", never
  "you have never used this".
*/
export async function usedModes(orgId: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  if (!orgId) return out;
  const svc = serviceClient();
  if (!svc) return out;
  try {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data, error } = await svc.from("funnel_events").select("meta")
      .eq("org_id", orgId).eq("event", "feature_used").gte("created_at", since).limit(5000);
    if (error) return out;
    for (const r of (data as any[]) || []) { const f = r?.meta?.feature; if (typeof f === "string") out.add(f); }
  } catch { /* no signal is not an error */ }
  return out;
}

export function atlasRows(plan: string | null, used: Set<string>): AtlasRow[] {
  return FEATURES.map((f) => {
    const g = gateInfo(f, plan);
    return { id: f.id, included: g.included, label: g.label, used: f.modes.some((m) => used.has(m)) };
  });
}

export function suggestions(plan: string | null, used: Set<string>, limit = 3): Feature[] {
  return suggestFor({ included: (f) => gateInfo(f, plan).included, usedModes: used, limit });
}
