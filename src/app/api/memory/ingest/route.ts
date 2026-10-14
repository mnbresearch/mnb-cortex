import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { ingestBusinessData, canWriteMemory, memoryUpgradeMessage } from "@/lib/memory";
import { hasRole } from "@/lib/roles";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-click "Teach Cortex" — turn existing workspace data into memories + entities. Metered.
export async function POST() {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, memories: 0, entities: 0, error: "Teaching Cortex needs the analyst role or higher." }, { status: 403 });
  /* Plan gate before the charge: ingest only writes memories and entities. */
  if (!(await canWriteMemory(orgId))) return NextResponse.json({ ok: false, upgrade: true, memories: 0, entities: 0, error: await memoryUpgradeMessage() });
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
    /*
      The credits pay for the MODEL step — turning the data into memories.
      Entities are plain upserts with no model call, so "N entities, 0
      memories because the engine failed" is not the report that was paid
      for: refund it, keep the entities, and say what happened.
    */
    if (res && (res as any).engineFailed && !res.memories) {
      await refundIfCharged(gate, "report");
      return NextResponse.json({
        ok: false, memories: 0, entities: res.entities,
        error: `The AI engine could not be reached, so no memories were written${res.entities ? ` (${res.entities} customer and team names were still recorded)` : ""}. Try again in a moment. Your credits have not been used.`,
      });
    }
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
