import { NextResponse } from "next/server";
import { sendWeeklyPlans } from "@/lib/plan-email";
import { cronAuthorised } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
  300s, matching the autopilot cron this shares its work with.

  sendWeeklyPlans() spends a model call per workspace and budgets itself to 90
  seconds of that, plus the surrounding reads and the paced Resend batches. At
  60s this endpoint could not finish a real run: it would time out mid-loop,
  having claimed workspaces for the week that it then never emailed.
*/
export const maxDuration = 300;

// Per-workspace "plan for the week" email.
//   ?test=1  → render + send ONE to contact@mnbresearch.com (no customer blast)
// Auth: CRON_SECRET only — a caller-supplied header is not proof of anything.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const res = await sendWeeklyPlans({ test: url.searchParams.get("test") === "1" });
  return NextResponse.json({ ok: true, ...res });
}
