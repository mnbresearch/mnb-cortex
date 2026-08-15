import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { generateFor } from "@/lib/ai/cortex";
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

  // 2. Housekeeping on the public rate-limit buckets.
  try { await sb.rpc("prune_rate_limits"); } catch { /* migration not applied yet */ }

  // 3. Daily analysis — only for workspaces that are actually entitled to it.
  //    Running the model for expired/suspended workspaces is money spent on
  //    customers who aren't paying.
  const { data: orgs } = await sb.from("organizations").select("*");
  let ran = 0, skipped = 0;
  for (const o of (orgs as any[] || [])) {
    if (!entitled(o)) { skipped++; continue; }
    if (ran >= 50) break;
    const { data: m } = await sb.from("health_metrics").select("label,value,unit,delta_pct,status").eq("org_id", o.id);
    if (!m?.length) continue;
    const ctx = "KEY METRICS:\n" + m.map((x: any) => `- ${x.label}: ${x.value}${x.unit === "INR" ? " INR" : " " + x.unit} (${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, ${x.status})`).join("\n");
    let text = ""; try { text = await generateFor("pulse", "", ctx); } catch { continue; }
    await sb.from("alerts").insert({ org_id: o.id, severity: "yellow", module: "autopilot", title: "Autopilot daily analysis", body: text.slice(0, 400) });
    await sb.from("activity").insert({ org_id: o.id, type: "ai", message: "Autopilot ran the daily business analysis" });
    ran++;
  }

  // Weekly product-update email piggybacks on this daily cron — no extra Vercel
  // cron needed. Fires only on Mondays (IST) and only when explicitly enabled via
  // WEEKLY_UPDATE_ENABLED=1. sendWeeklyUpdate() is itself idempotent per version,
  // so a re-run the same week is a no-op.
  const istDay = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDay(); // 0=Sun … 1=Mon
  let weekly: any = null;
  try {
    if (process.env.WEEKLY_UPDATE_ENABLED === "1" && istDay === 1) {
      const { sendWeeklyUpdate } = await import("@/lib/weekly-update");
      weekly = await sendWeeklyUpdate({});
    }
  } catch (e: any) { weekly = { error: e?.message }; }

  // Per-workspace "plan for the week" email — also piggybacks the daily cron.
  let plan: any = null;
  try {
    if (process.env.WEEKLY_PLAN_ENABLED === "1" && istDay === 1) {
      const { sendWeeklyPlans } = await import("@/lib/plan-email");
      plan = await sendWeeklyPlans({});
    }
  } catch (e: any) { plan = { error: e?.message }; }

  return NextResponse.json({ ok: true, ran, skipped, expired, weekly, plan });
}
