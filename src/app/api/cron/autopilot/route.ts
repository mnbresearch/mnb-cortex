import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { generateFor } from "@/lib/ai/cortex";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") || new URL(req.url).searchParams.get("secret") === process.env.CRON_SECRET;
  if (!isCron) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ ok: true, ran: 0, note: "add SUPABASE_SERVICE_ROLE_KEY to enable scheduled autopilot" });
  const { data: orgs } = await sb.from("organizations").select("id");
  let ran = 0;
  for (const o of (orgs as any[] || []).slice(0, 50)) {
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

  return NextResponse.json({ ok: true, ran, weekly, plan });
}
