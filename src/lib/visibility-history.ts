import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import type { VisibilityReport } from "@/lib/ai/visibility";

/**
 * Visibility history — what makes a second run worth paying for.
 *
 * Nothing about a check was stored before this, so every 89-credit run was a
 * snapshot that vanished with the browser tab. See the migration header for
 * why that made the module's own pitch untrue.
 */

export type RunSummary = {
  id: string;
  brand: string;
  category: string | null;
  location: string | null;
  presence: number;
  prominence: number;
  avgPosition: number | null;
  shareOfVoice: number | null;
  promptsCount: number;
  mentionsCount: number;
  engine: string | null;
  createdAt: string;
};

function toSummary(r: any): RunSummary {
  return {
    id: r.id,
    brand: r.brand,
    category: r.category ?? null,
    location: r.location ?? null,
    presence: Number(r.presence) || 0,
    prominence: Number(r.prominence) || 0,
    avgPosition: r.avg_position === null || r.avg_position === undefined ? null : Number(r.avg_position),
    shareOfVoice: r.share_of_voice === null || r.share_of_voice === undefined ? null : Number(r.share_of_voice),
    promptsCount: Number(r.prompts_count) || 0,
    mentionsCount: Number(r.mentions_count) || 0,
    engine: r.engine ?? null,
    createdAt: r.created_at,
  };
}

/**
 * The most recent comparable run, or null.
 *
 * COMPARABLE is doing real work here. A score for a different brand, category
 * or city is not a previous reading of the same thing, and showing "up 18
 * points" because the customer changed the category from "auto parts" to
 * "clutch plate suppliers" would be a fabricated trend. Matching is on the
 * normalised triple, so only like-for-like runs become a trend.
 */
export async function previousRun(brand: string, category: string, location: string): Promise<RunSummary | null> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  const sb = await createClient();
  try {
    const { data, error } = await sb.from("visibility_runs")
      .select("id, brand, category, location, presence, prominence, avg_position, share_of_voice, prompts_count, mentions_count, engine, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error || !data?.length) return null;
    const match = (data as any[]).find((r) =>
      norm(String(r.brand ?? "")) === norm(brand) &&
      norm(String(r.category ?? "")) === norm(category) &&
      norm(String(r.location ?? "")) === norm(location));
    return match ? toSummary(match) : null;
  } catch { return null; }
}

/** This workspace's runs, newest first, for a history list. */
export async function listRuns(limit = 20): Promise<RunSummary[]> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return [];
  const sb = await createClient();
  try {
    const { data, error } = await sb.from("visibility_runs")
      .select("id, brand, category, location, presence, prominence, avg_position, share_of_voice, prompts_count, mentions_count, engine, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data as any[] || []).map(toSummary);
  } catch { return []; }
}

/**
 * Store a completed run.
 *
 * Returns false on failure rather than throwing, and the caller SAYS SO. The
 * check itself succeeded and the credits are legitimately spent, so failing
 * the whole request would be worse — but quietly dropping the row would leave
 * a customer believing they now have history they do not have, which is the
 * silent-write pattern this codebase has had to hunt down repeatedly.
 */
export async function saveRun(
  report: VisibilityReport, category: string, location: string,
): Promise<boolean> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return false;
  const sb = await createClient();
  try {
    const mentions = report.results.filter((r) => r.mentioned).length;
    const { data, error } = await sb.from("visibility_runs").insert({
      org_id: orgId,
      brand: report.brand,
      category: category || null,
      location: location || null,
      engine: report.engine,
      grounded: report.grounded,
      presence: report.scores.presence,
      prominence: report.scores.prominence,
      avg_position: report.scores.avgPosition,
      share_of_voice: report.scores.shareOfVoice,
      prompts_count: report.results.length,
      mentions_count: mentions,
      report: report as unknown as Record<string, unknown>,
    }).select("id");
    /* A zero-row insert with no error is still a failure to save. */
    if (error || !data || data.length === 0) return false;
    return true;
  } catch { return false; }
}
