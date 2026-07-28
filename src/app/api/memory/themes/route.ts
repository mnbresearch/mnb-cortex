import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { clusterThemes } from "@/lib/memory";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Qualitative analysis — cluster memories into themes. Uses AI → metered.
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, themes: [] });
  const gate = await chargeForMode("critique");
  if (!gate.ok) return NextResponse.json({ ok: false, outOfCredits: true, error: `Out of AI credits (balance ${gate.balance}).` }, { status: 402 });
  return NextResponse.json({ ok: true, themes: await clusterThemes(orgId) });
}
