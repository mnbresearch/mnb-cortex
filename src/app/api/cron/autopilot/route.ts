import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { serviceClient } from "@/lib/supabase/server";
import { generateFor } from "@/lib/ai/cortex";
import { recomputeMetrics } from "@/lib/metrics";
import { statusOf, isLapsed } from "@/lib/entitlement";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Is this workspace entitled to have AI run on its behalf today?
 *
 * Uses the same rules as the paywall rather than a second copy of them. The
 * copy that used to live here had already drifted: it didn't know about the
 * renewal grace period, so a customer whose mandate debited a day late would be
 * allowed to use the product interactively but skipped by their own autopilot.
 */
function entitled(o: any): boolean {
  return !isLapsed(statusOf(o));
}

export async function GET(req: Request) {
  let scheduledWorkflows = 0;
  let alertsEmailed = 0;
  let collectionsSent = 0;
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ ok: true, ran: 0, note: "add SUPABASE_SERVICE_ROLE_KEY to enable scheduled autopilot" });

  // 1. Expire any paid plan whose period has run out, before doing anything else.
  let expired = 0;
  try {
    const { data } = await sb.rpc("expire_lapsed_subscriptions");
    expired = Number(data ?? 0);
  } catch { /* migration not applied yet */ }

  // 1b. Renewal reminders. Runs AFTER the expiry sweep so a plan that lapsed
  //     today gets its "your plan has ended" note on the same run. Each notice
  //     is claimed in renewal_notices before sending, so it goes out exactly
  //     once per period however often this cron fires.
  let renewals: any = null;
  try {
    const { sendRenewalReminders } = await import("@/lib/renewal-email");
    renewals = await sendRenewalReminders();
  } catch (e: any) { renewals = { error: e?.message }; }

  // 1c. Scheduled reports. Each row decides for itself whether it's due, using
  //     last_sent as the guard, so a double cron run can't double-send.
  let reports: any = null;
  try {
    const { runScheduledReports } = await import("@/lib/scheduled-reports");
    reports = await runScheduledReports();
  } catch (e: any) { reports = { error: e?.message }; }

  // 1d. Retry any webhook delivery that hasn't landed yet.
  let webhooks: any = null;
      /*
      Scheduled workflows. `workflows.trigger` has offered "schedule" since the
      table existed and nothing honoured it — executeWorkflow had exactly one
      caller, a Run button. Guarded by last_run with a claim-before-run, because
      a workflow can email and WhatsApp the customer's own contacts and the
      failure mode of running twice is not a blank screen.
    */
    try {
      const { runScheduledWorkflows } = await import("@/lib/workflow-schedule");
      const wf = await runScheduledWorkflows();
      scheduledWorkflows = wf.ran;
    } catch { /* never let this take the cron down */ }

    /*
      Collections. Draft what qualifies, then send only what is APPROVED —
      which, for a workspace that has not opted into auto-send, is nothing until
      a human has read it. The two steps are separate calls on purpose: a single
      function that both decided and sent would be one bug away from mailing
      every customer a business has.
    */
    try {
      const { serviceClient } = await import("@/lib/supabase/server");
      const { prepareDrafts, sendApproved } = await import("@/lib/collections");
      const svcC = serviceClient();
      if (svcC) {
        const { data: on } = await svcC.from("collection_policies")
          .select("org_id").eq("enabled", true).limit(200);
        for (const row of ((on as any[]) || [])) {
          const oid = String(row.org_id);
          try {
            const { data: o } = await svcC.from("organizations").select("name").eq("id", oid).single();
            await prepareDrafts(oid, String((o as any)?.name || "our company"));
            const r = await sendApproved(oid, new URL(req.url).origin);
            collectionsSent += r.sent;
          } catch { /* one workspace must not stop the rest */ }
        }
      }
    } catch { /* never let this take the cron down */ }

    /*
      Deliver the alerts that were raised. Until now a KPI breach wrote a row
      and waited to be noticed.
    */
    try {
      const { deliverAlerts } = await import("@/lib/alert-delivery");
      const d = await deliverAlerts(new URL(req.url).origin);
      alertsEmailed = d.sent;
    } catch { /* same */ }

    try {
    const { retryPending } = await import("@/lib/webhooks");
    webhooks = await retryPending();
  } catch (e: any) { webhooks = { error: e?.message }; }

  // 1e. Pull fresh data from every connected integration, before the KPI sweep
  //     so today's orders are already in when metrics recompute.
  let synced: any = null;
  try {
    const { syncAll } = await import("@/lib/sync");
    synced = await syncAll();
  } catch (e: any) { synced = { error: e?.message }; }

  // 2. Housekeeping on the public rate-limit buckets.
  try { await sb.rpc("prune_rate_limits"); } catch { /* migration not applied yet */ }

  // These used to run LAST, after two unbounded loops. On Hobby the function is
  // capped at 300s, so a timeout meant the weekly emails silently never sent.
  // They're cheap and time-sensitive, so they go first.
  const istDay = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDay(); // 0=Sun … 1=Mon
  let weekly: any = null;
  try {
    if (process.env.WEEKLY_UPDATE_ENABLED === "1" && istDay === 1) {
      const { sendWeeklyUpdate } = await import("@/lib/weekly-update");
      weekly = await sendWeeklyUpdate({});
    }
  } catch (e: any) { weekly = { error: e?.message }; }

  let plan: any = null;
  try {
    if (process.env.WEEKLY_PLAN_ENABLED === "1" && istDay === 1) {
      const { sendWeeklyPlans } = await import("@/lib/plan-email");
      plan = await sendWeeklyPlans({});
    }
  } catch (e: any) { plan = { error: e?.message }; }

  // Stable ordering so the work is deterministic across runs, and only the
  // columns entitled() actually needs.
  const { data: orgs } = await sb
    .from("organizations")
    .select("id,subscription_status,trial_ends_at,subscription_ends_at,autorenew_status")
    .order("created_at", { ascending: true });

  // 3. Safety-net metrics sweep. Every write path recomputes inline, so this only
  //    catches workspaces whose inline recompute failed, and keeps time-sensitive
  //    KPIs (overdue receivables, inventory cover) current as dates roll over.
  //    Batched and capped: every write path already recomputes inline, so this
  //    is a safety net, not the primary path — it must never eat the AI budget.
  //    Deliberately NOT gated on entitlement. Recomputing KPIs costs a couple of
  //    cheap queries and is about the stored numbers being TRUE, not about who
  //    is paying. Gating it meant a lapsed workspace kept whatever figures were
  //    last computed — the live dashboard was still reporting "Revenue (MTD)
  //    ₹5.00 L / Orders 2" for a workspace whose sales table was empty, because
  //    nothing had recomputed since the rows were removed. Stale numbers a
  //    customer might act on are worse than a few milliseconds of database time,
  //    and they're the first thing someone sees if they come back and renew.
  const SWEEP_CAP = 200, BATCH = 5;
  const sweepable = (orgs as any[] || []).slice(0, SWEEP_CAP);
  let recomputed = 0;
  for (let i = 0; i < sweepable.length; i += BATCH) {
    const results = await Promise.all(sweepable.slice(i, i + BATCH).map(async (o) => {
      try { return (await recomputeMetrics(o.id)).ok; } catch { return false; }
    }));
    recomputed += results.filter(Boolean).length;
  }

  // 4. Daily analysis — only for workspaces that are actually entitled to it.
  //    Running the model for expired/suspended workspaces is money spent on
  //    customers who aren't paying.
  //    Budgeted by wall clock, not just count: an LLM call is 2-10s and the
  //    function dies at 300s, which would lose the counts and the email results.
  const deadline = Date.now() + 200_000;
  let ran = 0, skipped = 0;
  for (const o of (orgs as any[] || [])) {
    if (!entitled(o)) { skipped++; continue; }
    if (ran >= 20 || Date.now() > deadline) break;
    const { data: m } = await sb.from("health_metrics").select("label,value,unit,delta_pct,status").eq("org_id", o.id);
    if (!m?.length) continue;
    const ctx = "KEY METRICS:\n" + m.map((x: any) => `- ${x.label}: ${x.value}${x.unit === "INR" ? " INR" : " " + x.unit} (${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, ${x.status})`).join("\n");
    let text = ""; try { text = await generateFor("pulse", "", ctx); } catch { continue; }
    await sb.from("alerts").insert({ org_id: o.id, severity: "yellow", module: "autopilot", title: "Autopilot daily analysis", body: text.slice(0, 400) });
    await sb.from("activity").insert({ org_id: o.id, type: "ai", message: "Autopilot ran the daily business analysis" });
    ran++;
  }

  // Heartbeat. /api/health reads this rather than inferring liveness from a
  // side effect that only happens when a workspace has data — a healthy cron
  // over an empty account would otherwise look dead.
  //
  // The error is REPORTED, not swallowed. The first version wrapped this in a
  // bare try/catch, but supabase-js returns {error} for a rejected write rather
  // than throwing — so the catch never fired, the write failed every run, and
  // the response still said ok:true. A monitoring signal that fails silently is
  // worse than none, because it looks like the thing it monitors is broken.
  let heartbeat = "ok";
  try {
    const now = new Date().toISOString();
    // .select() forces PostgREST to RETURN the written row. Without it the write
    // reported success while nothing landed and nothing could be read back —
    // which is indistinguishable from a dead cron, and took three deploys to
    // pin down. Ask for the row and we know for certain whether it exists.
    const { data: wrote, error: hbErr } = await sb
      .from("system_status")
      .upsert({ key: "cron_last_run", value: now, updated_at: now }, { onConflict: "key" })
      .select("key,value");

    if (hbErr) {
      heartbeat = `${hbErr.code || "error"}: ${hbErr.message}`;
    } else if (!(wrote as any[])?.length) {
      // No error and no row back means the write was accepted and then
      // discarded — the signature of a row-level security policy silently
      // filtering it, i.e. this client is not really the service role.
      heartbeat = "write accepted but no row returned — check SUPABASE_SERVICE_ROLE_KEY is the service_role key, not the anon key";
    }
    if (heartbeat !== "ok") console.error("[cron] heartbeat —", heartbeat);
  } catch (e: any) {
    heartbeat = `threw: ${e?.message}`;
    console.error("[cron] heartbeat threw —", e?.message);
  }

  return NextResponse.json({ ok: true, ran, skipped, expired, recomputed, renewals, reports, webhooks, synced, weekly, plan, heartbeat, scheduledWorkflows, alertsEmailed, collectionsSent });
}
