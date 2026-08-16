import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { generateFor } from "@/lib/ai/cortex";
import { recomputeMetrics } from "@/lib/metrics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Is this workspace entitled to have AI run on its behalf today? */
function entitled(o: any): boolean {
  const status = String(o?.subscription_status || "trialing");
  if (status === "suspended" || status === "cancelled" || status === "expired") return false;
  const now = Date.now();
  if (status === "active") {
    // No recorded period = manually granted workspace, treat as entitled.
    if (!o?.subscription_ends_at) return true;
    return new Date(o.subscription_ends_at).getTime() > now;
  }
  // Trialing: only while the trial window is still open.
  if (!o?.trial_ends_at) return true;
  return new Date(o.trial_ends_at).getTime() > now;
}

export async function GET(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") || new URL(req.url).searchParams.get("secret") === process.env.CRON_SECRET;
  if (!isCron) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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
    .select("id,subscription_status,trial_ends_at,subscription_ends_at")
    .order("created_at", { ascending: true });

  // 3. Safety-net metrics sweep. Every write path recomputes inline, so this only
  //    catches workspaces whose inline recompute failed, and keeps time-sensitive
  //    KPIs (overdue receivables, inventory cover) current as dates roll over.
  //    Batched and capped: every write path already recomputes inline, so this
  //    is a safety net, not the primary path — it must never eat the AI budget.
  const SWEEP_CAP = 200, BATCH = 5;
  const sweepable = (orgs as any[] || []).filter(entitled).slice(0, SWEEP_CAP);
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

  return NextResponse.json({ ok: true, ran, skipped, expired, recomputed, renewals, weekly, plan });
}
