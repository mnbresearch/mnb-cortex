import { NextResponse } from "next/server";
import { sendWeeklyPlans } from "@/lib/plan-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Per-workspace "plan for the week" email.
//   ?test=1  → render + send ONE to contact@mnbresearch.com (no customer blast)
// Auth: Vercel cron header, or ?secret=CRON_SECRET for a manual trigger.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const isCron = req.headers.get("x-vercel-cron") || url.searchParams.get("secret") === process.env.CRON_SECRET;
  if (!isCron) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const res = await sendWeeklyPlans({ test: url.searchParams.get("test") === "1" });
  return NextResponse.json({ ok: true, ...res });
}
