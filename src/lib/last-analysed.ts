import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

/**
 * When THIS workspace's numbers were last actually read.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Six public surfaces promise a cadence:
 *
 *   "Cortex re-reads your numbers overnight on its own"
 *   "It watches your numbers every day"
 *   "Cortex reads across all of it every day"
 *   "It runs the loop, every day."          (was "continuously")
 *
 * The schedule genuinely is daily — `30 4 * * *` in vercel.json. But the
 * nightly sweep is capped and rotated: ANALYSIS_CAP workspaces per run, plus
 * a wall-clock budget that `break`s the loop. The features page already said
 * so, in a code comment:
 *
 *   "at 100 paying workspaces 'daily' is every fifth day"
 *
 * — two cards below a heading that then claimed "continuously".
 *
 * So the claim is true of the schedule and becomes false for any particular
 * workspace as the product succeeds. That is the worst kind of claim to
 * leave alone: correct when written, quietly wrong later, and invisible
 * until a customer notices their warning is four days stale.
 *
 * This codebase has solved exactly this shape before. The dashboard used to
 * show a cash balance with no date on it, so a six-month-old bank statement
 * read as the position today; the fix was not to weaken the copy but to
 * print `cashAsOf` beside the number. Same here: /autopilot prints when this
 * workspace was last read. If the cap ever starts biting, the owner sees it
 * before we do, and the promise stays checkable by the person it was made to.
 *
 * ============================================================================
 * WHY health_metrics, AND NOT THE CRON LOG
 * ============================================================================
 *
 * `system_status` records that the CRON ran. That is a fact about our
 * infrastructure, not about this customer — a sweep that ran perfectly and
 * rotated past them would report success while their numbers went unread,
 * which is the precise failure being guarded against.
 *
 * `health_metrics.created_at` is written by recomputeMetrics() for the org
 * being recomputed, so it answers the question actually asked: when was MY
 * business last looked at. It is also written by an import or a manual run,
 * which is correct — those are real reads too, and an owner who imported an
 * hour ago should not be told their numbers are three days old.
 */

/** IST, because the reader is in India and a date is what they asked for. */
function istDate(iso: string): { label: string; days: number } | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const fmt = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
  });
  const days = Math.floor((Date.now() - t) / 86_400_000);
  return { label: fmt.format(new Date(t)), days };
}

/**
 * A human phrase, or null when this workspace has never been read.
 *
 * Returns null rather than a placeholder on any failure — the caller shows
 * "not read yet", which is the safe direction. Claiming a read happened when
 * the lookup failed would reintroduce the exact reassurance this is here to
 * remove.
 */
export async function getLastAnalysedAt(): Promise<string | null> {
  try {
    const { user, orgId } = await getUserAndOrg();
    if (!user || !orgId) return null;

    const sb = await createClient();
    const { data, error } = await sb
      .from("health_metrics")
      .select("created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !data?.length) return null;
    const d = istDate(String(data[0].created_at));
    if (!d) return null;

    if (d.days <= 0) return "today";
    if (d.days === 1) return "yesterday";
    /*
      Past a few days the number of days matters more than the date: "6 days
      ago" is a prompt to ask why, where "24 Sep" is just a date. Both are
      given so the owner can check it against their own records.
    */
    return `${d.days} days ago (${d.label})`;
  } catch {
    return null;
  }
}
