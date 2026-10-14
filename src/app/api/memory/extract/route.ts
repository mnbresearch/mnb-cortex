import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { extractMemories, canWriteMemory, memoryUpgradeMessage } from "@/lib/memory";
import { hasRole } from "@/lib/roles";

/* Generous for a pasted conversation or document; extractMemories reads 6,000 of it. */
const MAX_TEXT = 12_000;
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

// Extract durable memories from pasted text / a conversation. Uses AI → metered.
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });

  // Read the body and validate BEFORE charging. extractMemories() returns
  // { count: 0 } for empty text without calling a model, so charging first
  // billed the customer for submitting an empty box.
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, count: 0, items: [], error: "Saving to Cortex Memory needs the analyst role or higher." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const text = String((b as any).text || "").slice(0, MAX_TEXT);
  if (!text.trim()) {
    return NextResponse.json({ ok: false, count: 0, items: [], error: "Paste some text first — nothing was analysed, so you have not been charged." });
  }

  /* The plan gate BEFORE the charge and the model call — not discovered after both. */
  if (!(await canWriteMemory(orgId))) {
    return NextResponse.json({ ok: false, upgrade: true, count: 0, items: [], error: await memoryUpgradeMessage() });
  }

  const gate = await chargeForMode("document");
  if (!gate.ok) { const d = creditDenial(gate, "Extracting memories"); return NextResponse.json(d.body, { status: d.status }); }

  try {
    const res = await extractMemories(orgId, text, user?.id ?? null);
    if (!res || !res.count) {
      await refundIfCharged(gate, "document");
      const why = (res as any)?.engineFailed
        ? "The AI engine could not be reached, so nothing was analysed — try again in a moment."
        : "Nothing worth remembering was found in that text.";
      return NextResponse.json({ ok: false, count: 0, items: [], error: `${why} Your credits have not been used.` });
    }
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    await refundIfCharged(gate, "document");
    return NextResponse.json({ ok: false, count: 0, items: [], error: (e?.message || "Could not extract memories.") + " Your credits have not been used." });
  }
}
