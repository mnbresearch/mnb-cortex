import { NextResponse } from "next/server";
import { buildPriorities } from "@/lib/ai/priorities";
import { getBusinessContext, getMetrics, getUserAndOrg } from "@/lib/data";
import { enforce } from "@/lib/ratelimit";
import { cachedByInput } from "@/lib/ai/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The guided "what to do next" layer for the dashboard. Free (core navigation),
// auth-gated, and always returns something (setup checklist / rules fallback).
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: true, priorities: [], mode: "none" });

  /*
    Rate limited rather than metered, and it needed one or the other.

    buildPriorities() makes a real model call. This was the ONLY AI route in the
    product with neither chargeForMode() nor an enforce() bucket, so any
    signed-in account could sit in a loop and spend model budget for free —
    including a workspace whose subscription has lapsed, since there is no
    requireWorkspace() here either.

    Keeping it free is deliberate: this powers "what to do next" on the
    dashboard, which is core navigation, and charging credits to be told what to
    click is a bad trade. So the fix is a ceiling, not a price. 120/day is far
    above real use (the dashboard calls this on load) and far below abuse.
  */
  const over = await enforce([{ key: `priorities:org:${orgId}`, limit: 120, windowSecs: 86_400 }]);
  if (over) {
    return NextResponse.json(
      { ok: true, priorities: [], mode: "none", rateLimited: true },
      { status: 200 },   // the dashboard degrades quietly; this is not an error the user caused
    );
  }

  try {
    const [ctx, metrics] = await Promise.all([getBusinessContext(), getMetrics()]);
    const hasData = Array.isArray(metrics) && metrics.length > 0;

    /*
      Cached on the INPUT, not on a timer.

      next-best-actions.tsx calls this from a useEffect on the dashboard, which
      is the landing page — so every view, refresh, back-navigation and second
      tab was a Gemini call and two to ten seconds of latency for a card nobody
      clicked. The rate limit above caps abuse per workspace but does nothing
      about the cost of ordinary use across many workspaces.

      The context reads still run on every request; only the model call is
      skipped, and only when the context is byte-for-byte what it was last time.
      So the advice updates the moment the underlying numbers do, which a TTL
      could not promise without also recomputing constantly. Six hours is a
      ceiling for changes the fingerprint cannot see, like a new prompt.
    */
    const { value: res, hit } = await cachedByInput(
      orgId, "priorities", { ctx, hasData }, 6 * 60 * 60,
      () => buildPriorities(ctx, hasData),
    );
    return NextResponse.json({ ok: true, ...res, cached: hit });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not build priorities.", priorities: [], mode: "none" });
  }
}
