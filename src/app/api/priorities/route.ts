import { NextResponse } from "next/server";
import { buildPriorities } from "@/lib/ai/priorities";
import { getBusinessContext, getMetrics, getUserAndOrg } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The guided "what to do next" layer for the dashboard. Free (core navigation),
// auth-gated, and always returns something (setup checklist / rules fallback).
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: true, priorities: [], mode: "none" });
  try {
    const [ctx, metrics] = await Promise.all([getBusinessContext(), getMetrics()]);
    const hasData = Array.isArray(metrics) && metrics.length > 0;
    const res = await buildPriorities(ctx, hasData);
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not build priorities.", priorities: [], mode: "none" });
  }
}
