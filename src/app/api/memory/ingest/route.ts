import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { ingestBusinessData } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click "Teach Cortex" — turn existing workspace data into memories + entities. Metered.
export async function POST() {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  const gate = await chargeForMode("report");
  if (!gate.ok) { const d = creditDenial(gate, "Ingesting your data"); return NextResponse.json(d.body, { status: d.status }); }
  const res = await ingestBusinessData(orgId, user?.id ?? null);
  return NextResponse.json({ ok: true, ...res });
}
