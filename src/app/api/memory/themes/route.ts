import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { clusterThemes, listMemories } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
  60s, NOT the 15s platform default.

  This route calls runCortex() through lib/memory.ts — a model call with a
  retry chain and no fetch timeout of its own, so 3-10s is normal and longer is
  possible. Against a 15s default it 504s.

  The billing consequence is what makes this urgent rather than annoying:
  chargeForMode() runs BEFORE the model call, and refundIfCharged() lives in
  the catch. A Vercel timeout kills the function rather than throwing, so the
  catch never runs and the customer is charged for a request that returned an
  error page. Every refund guarantee in this codebase depends on the function
  living long enough to execute its own catch block.

  api/memory/ingest already declares 60. These three were the outliers.
*/
export const maxDuration = 60;

// Qualitative analysis — cluster memories into themes. Uses AI → metered.
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, themes: [] });

  /*
    THE PRECONDITION IS CHECKED BEFORE THE CHARGE, which is the whole fix.

    clusterThemes() returns [] outright when the workspace has fewer than three
    memories — no model call, no work, nothing to bill for. The charge used to
    happen above it, so a new workspace with one or two memories paid the
    `critique` cost to receive an empty array, and could do so again on every
    click, forever. It is the most reliably unfair charge in the product
    precisely because it is deterministic: it never once returned a theme.

    Reading the memories twice is cheap next to charging for nothing.
  */
  const existing = await listMemories(orgId, { limit: 3 }).catch(() => [] as any[]);
  if (existing.length < 3) {
    return NextResponse.json({
      ok: true,
      themes: [],
      needsMore: true,
      message: "Themes need at least three memories to compare. Add a few more and Cortex will find the patterns — you have not been charged.",
    });
  }

  const gate = await chargeForMode("critique");
  if (!gate.ok) { const d = creditDenial(gate, "Clustering themes"); return NextResponse.json(d.body, { status: d.status }); }

  try {
    const themes = await clusterThemes(orgId);
    if (!Array.isArray(themes) || themes.length === 0) {
      await refundIfCharged(gate, "critique");
      return NextResponse.json({ ok: false, themes: [], error: "Could not group those memories into themes — try again in a moment. Your credits have not been used." });
    }
    return NextResponse.json({ ok: true, themes });
  } catch (e: any) {
    await refundIfCharged(gate, "critique");
    return NextResponse.json({ ok: false, themes: [], error: (e?.message || "Could not cluster themes.") + " Your credits have not been used." });
  }
}
