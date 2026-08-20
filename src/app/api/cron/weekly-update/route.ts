import { NextResponse } from "next/server";
import { sendWeeklyUpdate } from "@/lib/weekly-update";
import { cronAuthorised } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly product-update email.
 *   ?test=1   send ONE test to contact@mnbresearch.com (does the full render, no user blast)
 *   ?force=1  send even if this version was already emailed
 * Auth: CRON_SECRET only. This route mails EVERY confirmed user in the project,
 * so it is the last place to accept a caller-supplied header as proof.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const test = url.searchParams.get("test") === "1";
  const force = url.searchParams.get("force") === "1";
  const res = await sendWeeklyUpdate({ test, force });
  return NextResponse.json({ ok: true, ...res });
}
