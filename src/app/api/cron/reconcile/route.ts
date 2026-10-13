import { NextResponse } from "next/server";
import { reconcilePayments } from "@/lib/pay/reconcile";
import { cronAuthorised } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Each order checked is one Cashfree round-trip plus, where it repairs, a
   settlement. Two queues of forty is comfortably inside 300s, and the caps in
   lib/pay/reconcile.ts are what keep it that way. */
export const maxDuration = 300;

/**
 * Daily payment reconciliation.
 *
 *   /api/cron/reconcile          → reconcile and repair
 *   /api/cron/reconcile?dry=1    → report what it WOULD do, change nothing
 *
 * Auth: CRON_SECRET only. A caller-supplied header is not proof of anything —
 * see lib/cron-auth.ts for what that mistake used to allow.
 *
 * WHY IT IS ITS OWN SCHEDULE rather than a step inside /api/cron/autopilot:
 * autopilot spends a shared 300-second budget on model calls and mail, and it
 * breaks out of its loops when that budget runs low. Reconciliation is the one
 * job that must not be the thing that gets dropped when the night runs long —
 * it is the only mechanism that finds a customer who paid and received nothing.
 *
 * A NON-2xx WHEN SOMETHING NEEDS A HUMAN is deliberate. Vercel's cron log shows
 * failures, and a 200 with a body nobody reads is how the coverage numbers
 * became invisible for months (see lib/cron-coverage.ts). An unresolved
 * discrepancy is a real failure of the system, so it answers like one.
 */
export async function GET(req: Request) {
  if (!cronAuthorised(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const report = await reconcilePayments({ dryRun });

  /*
    ABANDONED-CHECKOUT FOLLOW-UP runs HERE, straight after reconcile, because
    it acts only on intents reconcile has just confirmed unpaid with Cashfree.
    11:30 IST is a civil hour for an email. Its mode (off / dry_run / live) is
    the operator's switch; on ?dry=1 it is always a dry run. A failure here
    never changes the reconcile verdict — payments are the job, this is a nicety.
  */
  let followup: any = null;
  try {
    const { runCheckoutFollowups } = await import("@/lib/checkout-followup");
    const { createBudget } = await import("@/lib/cron-budget");
    const r = await runCheckoutFollowups({ budget: createBudget(60_000), ...(dryRun ? { forceMode: "dry_run" as const } : {}) });
    /* Masked addresses only, and only counts in the cron log. */
    followup = { mode: r.mode, considered: r.considered, queued: r.queued, sent: r.sent, failed: r.failed, uncertain: r.uncertain, skipped: r.skipped, error: r.error };
  } catch (e: any) { followup = { error: String(e?.message || e) }; }

  const status = report.ok && report.unresolved.length === 0 ? 200 : (report.ok ? 409 : 500);
  return NextResponse.json({
    ok: report.ok,
    dryRun,
    checked: report.checked,
    recovered: report.recovered,
    unresolved: report.unresolved,
    abandoned: report.abandoned,
    clean: report.clean,
    error: report.error,
    followup,
  }, { status });
}
