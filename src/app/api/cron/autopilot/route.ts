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
  return NextResponse.json({ ok: true, ran });
}
