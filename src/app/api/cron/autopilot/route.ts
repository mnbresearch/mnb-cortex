import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { serviceClient } from "@/lib/supabase/server";
import { generateFor } from "@/lib/ai/cortex";
import { withOrgAiKeys } from "@/lib/ai/byo";
import { recomputeMetrics } from "@/lib/metrics";
import { statusOf, isLapsed } from "@/lib/entitlement";
import { rotate } from "@/lib/cron-rotation";
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
        /*
          LEAST RECENTLY SWEPT first, not an arbitrary 200.

          This was `.limit(200)` with no ordering. PostgREST returns whatever
          the planner produces, so past 200 enabled workspaces the same ones
          were served every night and the rest never were — a customer paying
          for automated chasing would find it had quietly stopped, with no
          error anywhere to explain it.

          Ordering by last_swept_at with NULLs first makes the rotation fair
          and deterministic: every workspace is reached within ceil(n/200)
          days, and one that has never run goes to the front.
        */
        /*
          DEPLOY ORDER. `last_swept_at` is added by
          2026_collections_whatsapp.sql, which ships in the same commit as this
          code — and Vercel deploys before anyone runs a migration. Ordering by
          a column PostgREST does not know about fails the whole SELECT, `data`
          comes back null, the loop runs zero times, and collections silently
          stops for every customer with no error anywhere.

          So: try the ordered read, and fall back to the unordered one if the
          column is not there yet. The fallback is the old behaviour (an
          arbitrary 200), which is worse than the rotation but infinitely better
          than nothing, and it repairs itself the moment the migration lands.
        */
        let on: any[] | null = null;
        {
          const ordered = await svcC.from("collection_policies")
            .select("org_id").eq("enabled", true)
            .order("last_swept_at", { ascending: true, nullsFirst: true })
            .limit(200);
          if (ordered.error) {
            const plain = await svcC.from("collection_policies")
              .select("org_id").eq("enabled", true).limit(200);
            on = (plain.data as any[]) || [];
            console.warn("[cron] last_swept_at missing — run 2026_collections_whatsapp.sql; sweeping without rotation");
          } else {
            on = (ordered.data as any[]) || [];
          }
        }
        for (const row of (on || [])) {
          const oid = String(row.org_id);
          try {
            const { data: o } = await svcC.from("organizations").select("name").eq("id", oid).single();
            await prepareDrafts(oid, String((o as any)?.name || "our company"));
            const r = await sendApproved(oid, new URL(req.url).origin);
            collectionsSent += r.sent;
          } catch { /* one workspace must not stop the rest */ }
          /*
            Stamp OUTSIDE the try, so a workspace that throws still moves to the
            back of the queue. Otherwise one permanently-failing workspace sits
            at the head of the rotation forever and starves everyone behind it —
            turning a single broken tenant into an outage for all of them.
          */
          try {
            await svcC.from("collection_policies")
              .update({ last_swept_at: new Date().toISOString() }).eq("org_id", oid);
          } catch { /* column not migrated yet — rotation is best-effort */ }
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

  /*
    ON BY DEFAULT, because the landing page sells it.

    page.tsx promises "One email on Monday: the three things worth your
    attention this week", and the onboarding finish screen repeats it under
    "Here is what happens without you doing anything else". This is the code
    that delivers exactly that — buildPriorities() per workspace, emailed to
    its members — and it was gated behind an env var that is set nowhere, so
    the answer to "what happens without you doing anything else" was: nothing.

    The weekly BRIEF does ship (scheduled_reports, default-on), but it is a
    general narrative on a drifting ~6.5-day cycle, so it satisfies neither the
    "Monday" nor the "three things" half of the promise.

    So the flag is inverted: opt OUT with WEEKLY_PLAN_ENABLED=0. The send is
    already safe to leave running — it skips workspaces with no health_metrics
    ("nothing honest to send"), honours email_optouts, and the istDay check
    keeps it to Monday IST.
  */
  let plan: any = null;
  try {
    if (process.env.WEEKLY_PLAN_ENABLED !== "0") {
      /*
        RUNS EVERY DAY, sends at most once per workspace per week.

        The Monday-only gate that used to be here was what made the 60-workspace
        cap a silent truncation: one shot a week, and anything past 60 was
        simply never mailed. sendWeeklyPlans() now records what it sent against
        an ISO week, so a daily run is safe — Monday does the bulk of the work
        and the following days drain whatever the budget deferred, with the
        ledger guaranteeing nobody is mailed twice in the same week.
      */
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
  /*
    ROTATED, not sliced.

    This was `orgs.slice(0, SWEEP_CAP)` against a list ordered by created_at
    ascending — the same 200 workspaces every night, forever. Workspace 201 was
    never swept. The cap is still needed (300s function limit); what was missing
    is that the window has to move. See lib/cron-rotation.ts.
  */
  const SWEEP_CAP = 200, BATCH = 5;
  const sweep = await rotate("metrics_sweep", (orgs as any[]) || [], SWEEP_CAP);
  let recomputed = 0;
  for (let i = 0; i < sweep.batch.length; i += BATCH) {
    const results = await Promise.all(sweep.batch.slice(i, i + BATCH).map(async (o: any) => {
      try { return (await recomputeMetrics(o.id)).ok; } catch { return false; }
    }));
    recomputed += results.filter(Boolean).length;
  }
  await sweep.commit(sweep.batch.length);

  // 4. Daily analysis — only for workspaces that are actually entitled to it.
  //    Running the model for expired/suspended workspaces is money spent on
  //    customers who aren't paying.
  //    Budgeted by wall clock, not just count: an LLM call is 2-10s and the
  //    function dies at 300s, which would lose the counts and the email results.
  /*
    Also rotated, and rotated over the ENTITLED list rather than over all
    workspaces.

    The old loop iterated every org and broke at `ran >= 20`. Entitled or not,
    it walked them in the same order every night, so the twenty-first entitled
    workspace never got an analysis. Filtering first means the twenty slots go
    to twenty workspaces that can actually use them, instead of being consumed
    by position in a list mostly made of lapsed accounts.
  */
  const ANALYSIS_CAP = 20;
  const entitledOrgs = ((orgs as any[]) || []).filter(entitled);
  const skipped = (((orgs as any[]) || []).length) - entitledOrgs.length;
  const analysis = await rotate("daily_analysis", entitledOrgs, ANALYSIS_CAP);

  const deadline = Date.now() + 200_000;
  let ran = 0;
  for (const o of analysis.batch) {
    if (ran >= ANALYSIS_CAP || Date.now() > deadline) break;
    const { data: m } = await sb.from("health_metrics").select("label,value,unit,delta_pct,status").eq("org_id", o.id);
    if (!m?.length) continue;
    // Same null-delta guard as getBusinessContext(): "null%" is not a change.
    const ctx = "KEY METRICS:\n" + m.map((x: any) => {
      const d = typeof x.delta_pct === "number" && Number.isFinite(x.delta_pct)
        ? `${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, ` : "";
      return `- ${x.label}: ${x.value}${x.unit === "INR" ? " INR" : " " + x.unit} (${d}${x.status})`;
    }).join("\n");
    /*
      Each org's analysis must run on THAT org's AI key. Without this the
      nightly loop sent every customer's business context to our own Gemini
      account, including customers who had connected their own provider
      precisely so that would not happen.
    */
    let text = "";
    try { text = await withOrgAiKeys(o.id, () => generateFor("pulse", "", ctx)); } catch { continue; }
    await sb.from("alerts").insert({ org_id: o.id, severity: "yellow", module: "autopilot", title: "Autopilot daily analysis", body: text.slice(0, 400) });
    await sb.from("activity").insert({ org_id: o.id, type: "ai", message: "Autopilot ran the daily business analysis" });
    ran++;
  }
  await analysis.commit(ran);

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

  /*
    COVERAGE IS REPORTED, not implied.

    The old response was `ok: true` plus counts, which reads as success whether
    the run covered every workspace or the first 200 of ten thousand. Now that
    the rotation makes full coverage take several nights by design, the run has
    to say how much of the platform it reached — otherwise "we serve everyone"
    remains an assumption nobody can check.

    `nights_for_full_cycle` is the number to watch: if it starts climbing, the
    caps need raising or the cron needs to run more often, and that should be a
    decision rather than a discovery.
  */
  const coverage = {
    metrics_sweep: {
      workspaces: sweep.total,
      this_run: sweep.batch.length,
      wrapped: sweep.wrapped,
      nights_for_full_cycle: Math.max(1, Math.ceil(sweep.total / SWEEP_CAP)),
    },
    daily_analysis: {
      entitled: analysis.total,
      this_run: ran,
      wrapped: analysis.wrapped,
      nights_for_full_cycle: Math.max(1, Math.ceil(analysis.total / ANALYSIS_CAP)),
    },
  };

  return NextResponse.json({ ok: true, ran, skipped, expired, recomputed, renewals, reports, webhooks, synced, weekly, plan, heartbeat, scheduledWorkflows, alertsEmailed, collectionsSent, coverage });
}
