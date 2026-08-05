import { NextResponse } from "next/server";
import { sendWeeklyUpdate } from "@/lib/weekly-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly product-update email.
 *   ?test=1   send ONE test to contact@mnbresearch.com (does the full render, no user blast)
 *   ?force=1  send even if this version was already emailed
 * Auth: Vercel cron header, or ?secret=CRON_SECRET for a manual trigger.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const isCron = req.headers.get("x-vercel-cron") || url.searchParams.get("secret") === process.env.CRON_SECRET;
  if (!isCron) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const test = url.searchParams.get("test") === "1";
  const force = url.searchParams.get("force") === "1";
  const res = await sendWeeklyUpdate({ test, force });
  return NextResponse.json({ ok: true, ...res });
}
