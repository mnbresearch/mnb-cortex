import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { ingestBusinessData } from "@/lib/memory";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click "Teach Cortex" — turn existing workspace data into memories + entities. Metered.
export async function POST() {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  const gate = await chargeForMode("report");
  if (!gate.ok) return NextResponse.json({ ok: false, outOfCredits: true, error: `Out of AI credits (balance ${gate.balance}).` }, { status: 402 });
  const res = await ingestBusinessData(orgId, user?.id ?? null);
  return NextResponse.json({ ok: true, ...res });
}
