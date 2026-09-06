import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { getProfile, regenerateProfile } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ profile: null });
  return NextResponse.json({ profile: await getProfile(orgId) });
}

// Re-synthesize the living company profile. Uses AI → metered.
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
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
