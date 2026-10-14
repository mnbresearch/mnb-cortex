import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { getProfile, regenerateProfile, listMemories } from "@/lib/memory";
import { hasRole } from "@/lib/roles";
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

export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ profile: null });
  return NextResponse.json({ profile: await getProfile(orgId) });
}

// Re-synthesize the living company profile. Uses AI → metered.
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, profile_md: null, error: "Rebuilding the company profile needs the analyst role or higher." }, { status: 403 });
  /*
    NO MEMORIES, NO MODEL CALL, NO CHARGE. regenerateProfile() answers a
    workspace with nothing remembered with a fixed placeholder sentence; that
    was billed at the strategy price.
  */
  const existing = await listMemories(orgId, { limit: 1 }).catch(() => [] as any[]);
  if (!existing.length) {
    return NextResponse.json({ ok: false, profile_md: null, needsMore: true, error: "There are no memories to build a profile from yet. Capture a few facts, decisions or preferences first — you have not been charged." });
  }
  const gate = await chargeForMode("strategy");
  if (!gate.ok) { const d = creditDenial(gate, "Rebuilding your profile"); return NextResponse.json(d.body, { status: d.status }); }

  /*
    `ok: Boolean(md)` already told the truth about whether this worked — the
    route just never acted on its own verdict. A null profile was reported as
    a failure and billed as a success.
  */
  try {
    const md = await regenerateProfile(orgId);
    if (!md) {
      await refundIfCharged(gate, "strategy");
      return NextResponse.json({ ok: false, profile_md: null, error: "Could not rebuild your profile right now — try again in a moment. Your credits have not been used." });
    }
    return NextResponse.json({ ok: true, profile_md: md });
  } catch (e: any) {
    await refundIfCharged(gate, "strategy");
    return NextResponse.json({ ok: false, profile_md: null, error: (e?.message || "Could not rebuild your profile.") + " Your credits have not been used." });
  }
}
