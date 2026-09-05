import "server-only";
import { ownerEmail } from "@/lib/alert-delivery";
import { serviceClient } from "@/lib/supabase/server";
import { executeWorkflow } from "@/lib/workflows";

/**
 * Run the workflows that say they are scheduled.
 *
 * WHAT WAS MISSING.
 *
 * `workflows.trigger` has carried the value `schedule` since the table was
 * created, and the UI offers it. Nothing ever honoured it. `executeWorkflow`
 * had exactly one caller — a Run button — so "workflow automation", sold as a
 * Growth-plan feature, meant "a button you press yourself". A customer who set
 * a workflow to run daily got nothing, with no error and no explanation.
 *
 * The delivery mechanism was already there: the autopilot cron runs every day
 * at 02:30 UTC (08:00 IST) and already drives renewal emails, scheduled
 * reports, webhook retries, integration sync and the KPI recompute. This just
 * adds workflows to it, guarded by `last_run` the same way scheduled reports
 * guard themselves.
 *
 * DELIBERATELY CONSERVATIVE. A workflow can send email and WhatsApp on the
 * customer's behalf, so a scheduler bug here is not a blank screen — it is the
 * customer's own contacts being messaged repeatedly. Hence: a hard cap per run,
 * a 20-hour floor between runs of the same workflow, and `last_run` stamped
 * BEFORE execution rather than after.
 */

/**
 * Minimum gap between two runs of the same workflow.
 *
 * 20 hours, not 24. The cron fires at a fixed time each day, but Vercel's
 * scheduler can drift by minutes and a retry can fire twice; a strict 24-hour
 * test would skip a day whenever the second run landed even a minute early,
 * turning "daily" into "most days". 20 hours cannot produce two runs in one
 * calendar day while tolerating that drift.
 */
const MIN_GAP_MS = 20 * 60 * 60 * 1000;

/** Never run more than this many workflows in a single cron invocation. */
const MAX_PER_RUN = 50;

export type ScheduleResult = { considered: number; ran: number; failed: number };

export async function runScheduledWorkflows(): Promise<ScheduleResult> {
  const svc = serviceClient();
  if (!svc) return { considered: 0, ran: 0, failed: 0 };

  let rows: any[] = [];
  try {
    const { data } = await svc
      .from("workflows")
      .select("id, org_id, name, steps, last_run, trigger, is_active")
      .eq("trigger", "schedule")
      .eq("is_active", true)
      .limit(MAX_PER_RUN);
    rows = (data as any[]) || [];
  } catch { return { considered: 0, ran: 0, failed: 0 }; }

  let ran = 0, failed = 0;
  const now = Date.now();

  for (const wf of rows) {
    const last = wf.last_run ? new Date(wf.last_run).getTime() : 0;
    if (last && now - last < MIN_GAP_MS) continue;

    /*
      Claim the workflow BEFORE running it, and only proceed if the claim
      actually matched a row whose last_run is still what we read.

      Two cron invocations can overlap — a retry, or a manual trigger while the
      scheduled one is in flight. Stamping last_run afterwards would let both
      pass the gap check and both send. This makes the claim the thing that
      decides, so at most one wins.
    */
    const claim = await svc
      .from("workflows")
      .update({ last_run: new Date(now).toISOString() })
      .eq("id", wf.id)
      .eq("is_active", true)
      // `is` for a null last_run, `eq` otherwise — PostgREST needs the distinction.
      .filter("last_run", wf.last_run ? "eq" : "is", wf.last_run ?? null)
      .select("id");

    if (claim.error || !claim.data || claim.data.length === 0) continue;  // someone else took it

    try {
      const steps: string[] = Array.isArray(wf.steps)
        ? wf.steps.map((s: any) => (typeof s === "string" ? s : String(s?.text ?? s?.step ?? "")))
        : [];
      if (!steps.filter(Boolean).length) continue;

      /*
        ownerEmail was missing here, and workflows.ts refuses an `email` step
        without it ("No owner email on file"). Every workflow the product ships
        as an example ends in an email step, so the scheduled path — the one
        Watch Pro sells as "workflow automation on a schedule" — produced a
        failed step every night while the manual Run button worked.
      */
      const to = await ownerEmail(svc, wf.org_id);
      const res = await executeWorkflow(wf.org_id, steps.filter(Boolean), {
        name: wf.name || "Scheduled workflow",
        ownerEmail: to,
      });
      res.ok ? ran++ : failed++;

      try {
        await svc.from("workflow_runs").insert({
          workflow_id: wf.id,
          org_id: wf.org_id,
          status: res.ok ? "success" : "failed",
          summary: `[scheduled] ${res.summary}`.slice(0, 500),
        });
      } catch { /* the run happened; the audit row is best-effort */ }
    } catch {
      failed++;
    }
  }

  return { considered: rows.length, ran, failed };
}
