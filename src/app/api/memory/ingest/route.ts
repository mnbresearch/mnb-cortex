import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { ingestBusinessData } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-click "Teach Cortex" — turn existing workspace data into memories + entities. Metered.
export async function POST() {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  const gate = await chargeForMode("report");
  if (!gate.ok) { const d = creditDenial(gate, "Ingesting your data"); return NextResponse.json(d.body, { status: d.status }); }

  /*
    A brand-new workspace has nothing to ingest, so this returns
    { memories: 0, entities: 0 } having done no AI work at all — and "Teach
    Cortex" is a button that sits on the empty state, where a brand-new
    workspace is exactly who clicks it. Charging the report price to learn
    nothing, on the first action a customer takes, is the worst possible
    first impression.
  */
  try {
    const res = await ingestBusinessData(orgId, user?.id ?? null);
    if (!res || (!res.memories && !res.entities)) {
      await refundIfCharged(gate, "report");
      return NextResponse.json({
        ok: false, memories: 0, entities: 0,
        error: "There is nothing in this workspace to learn from yet — import or add some data first, then teach Cortex. Your credits have not been used.",
      });
    }
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    await refundIfCharged(gate, "report");
    return NextResponse.json({ ok: false, memories: 0, entities: 0, error: (e?.message || "Could not ingest your data.") + " Your credits have not been used." });
  }
}
