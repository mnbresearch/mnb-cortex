import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { extractMemories } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extract durable memories from pasted text / a conversation. Uses AI → metered.
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });

  // Read the body and validate BEFORE charging. extractMemories() returns
  // { count: 0 } for empty text without calling a model, so charging first
  // billed the customer for submitting an empty box.
  const b = await req.json().catch(() => ({} as any));
  const text = String((b as any).text || "");
  if (!text.trim()) {
    return NextResponse.json({ ok: false, count: 0, items: [], error: "Paste some text first — nothing was analysed, so you have not been charged." });
  }

  const gate = await chargeForMode("document");
  if (!gate.ok) { const d = creditDenial(gate, "Extracting memories"); return NextResponse.json(d.body, { status: d.status }); }

  try {
    const res = await extractMemories(orgId, text, user?.id ?? null);
    if (!res || !res.count) {
      await refundIfCharged(gate, "document");
      return NextResponse.json({ ok: false, count: 0, items: [], error: "Nothing worth remembering was found in that text. Your credits have not been used." });
    }
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    await refundIfCharged(gate, "document");
    return NextResponse.json({ ok: false, count: 0, items: [], error: (e?.message || "Could not extract memories.") + " Your credits have not been used." });
  }
}
