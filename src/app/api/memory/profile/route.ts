import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { getProfile, regenerateProfile } from "@/lib/memory";
import { chargeForMode } from "@/lib/credits";

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
  if (!gate.ok) return NextResponse.json({ ok: false, outOfCredits: true, error: `Out of AI credits (balance ${gate.balance}).` }, { status: 402 });
  const md = await regenerateProfile(orgId);
  return NextResponse.json({ ok: Boolean(md), profile_md: md });
}
