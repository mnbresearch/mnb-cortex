import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { clusterThemes } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Qualitative analysis — cluster memories into themes. Uses AI → metered.
export async function POST() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, themes: [] });
  const gate = await chargeForMode("critique");
  if (!gate.ok) { const d = creditDenial(gate, "Clustering themes"); return NextResponse.json(d.body, { status: d.status }); }
  return NextResponse.json({ ok: true, themes: await clusterThemes(orgId) });
}
