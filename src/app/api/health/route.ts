import { NextResponse } from "next/server";
import { getHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Public status endpoint.
 *
 * The checks themselves, and the 60-second cache that stops this unauthenticated
 * endpoint from spending Gemini and Resend quota on every request, live in
 * lib/health.ts so /api/badge can share them without a second HTTP round trip.
 */
export async function GET() {
  const { criticalDown, ...payload } = await getHealth();
  return NextResponse.json(
    payload,
    // 503 on a real outage, so uptime monitors and load balancers react.
    { status: criticalDown ? 503 : 200 },
  );
}
