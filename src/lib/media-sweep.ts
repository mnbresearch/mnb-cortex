import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { withOrgAiKeys } from "@/lib/ai/byo";
import { pollVideo, fetchVideo } from "@/lib/ai/video";
import { settleVideoJob, type MediaRow } from "@/lib/media";
import type { Budget } from "@/lib/cron-budget";

/*
  THE NIGHTLY SWEEP FOR VIDEO JOBS NOBODY WAITED FOR.

  The browser polls for six minutes and then stops. A clip that finishes after
  that, or a job whose tab was closed, used to be lost — and if Veo failed it,
  never refunded. This settles every job still `running` after ten minutes:
  finished → copied into the library; failed, or still not done after an hour
  → refunded once (media.failAndRefund holds the claim).

  Each job is polled on its own workspace's key, because a job submitted on a
  workspace's Google project is invisible to ours.
*/
export async function sweepVideoJobs(budget?: Budget, max = 25): Promise<{ checked: number; done: number; refunded: number; skipped?: string }> {
  const out = { checked: 0, done: 0, refunded: 0 } as { checked: number; done: number; refunded: number; skipped?: string };
  const svc = serviceClient();
  if (!svc) return { ...out, skipped: "no service role" };
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data, error } = await svc.from("media_assets").select("*")
    .eq("status", "running").lt("created_at", cutoff).order("created_at", { ascending: true }).limit(max);
  if (error) return { ...out, skipped: error.message };
  for (const row of (data as MediaRow[]) || []) {
    if (budget && !budget.ok(4_000)) break;
    out.checked++;
    try {
      const s = await withOrgAiKeys(row.org_id, () => settleVideoJob(row, pollVideo, fetchVideo, { giveUpAfterMs: 60 * 60_000 }));
      if (s.state === "done") out.done++;
      if (s.state === "error" && s.refunded) out.refunded++;
    } catch { /* one job must not stop the rest */ }
  }
  return out;
}
