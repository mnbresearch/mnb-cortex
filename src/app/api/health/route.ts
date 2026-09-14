import { NextResponse } from "next/server";
import { getHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
  60, NOT 30 — HEADROOM ABOVE THE WORK, NOT EQUAL TO IT.

  This was 30, and in production the endpoint returned
  `504 FUNCTION_INVOCATION_TIMEOUT` after 31.1 seconds, which left /status
  showing "Checking…" indefinitely. The model checks are legitimately allowed
  ~20s each (see MODEL_TIMEOUT in lib/health.ts — a real model round trip was
  measured at 27.9s), so a 30s route budget gave the rest of the work almost
  nothing.

  The durable fix is in lib/health.ts: every check now runs under its own
  deadline, so the total is bounded by construction rather than by hope. This
  raise is the belt to that braces — the endpoint whose job is to notice
  outages should be the last thing to fall over during one.
*/
export const maxDuration = 60;

/**
 * Public status endpoint.
 *
 * The checks themselves, and the 60-second cache that stops this unauthenticated
 * endpoint from spending Gemini and Resend quota on every request, live in
 * lib/health.ts so /api/badge can share them without a second HTTP round trip.
 */
/*
  WHAT AN ANONYMOUS CALLER GETS, AND WHY IT IS LESS THAN IT WAS.

  The `detail` strings on each check were written for an operator and were being
  served to the whole internet. The worst of them is literal:

      "2026_org_billing_guard (TRIGGER MISSING — billing is bypassable)"

  and the migration it names publishes the exploit in its own header comment
  (PATCH your own organizations row, set credits_allowance = -1, metering off
  for the account — including ~₹77-a-clip video). Refreshed every 60 seconds,
  that is a free oracle telling strangers exactly when the platform's weakest
  control is not installed. The neighbouring details leak the raw Postgres error
  text, the model currently serving traffic and its fallback chain, and the
  operator's free-text kill-switch reason.

  So: the SHAPE stays public, because that is what a status page is for and what
  /status and the uptime monitors consume — every check by name, with
  operational / degraded / down, and the same 503 on a real outage. The prose
  behind each verdict is for signed-in operators only.

  This is deliberately not "hide the finding". `criticalDown` and the per-check
  status still change colour the instant something breaks; an operator watching
  the status page learns just as fast. Only the sentence explaining WHICH
  internal control is missing now requires being one of us.
*/
export async function GET() {
  const { criticalDown, ...payload } = await getHealth();
  const { isSuperAdmin } = await import("@/lib/superadmin");
  const privileged = await isSuperAdmin().catch(() => false);

  const body = privileged ? payload : {
    ...payload,
    services: ((payload as any).services || []).map((s: any) => ({ name: s.name, status: s.status })),
  };

  return NextResponse.json(
    body,
    // 503 on a real outage, so uptime monitors and load balancers react.
    { status: criticalDown ? 503 : 200 },
  );
}
