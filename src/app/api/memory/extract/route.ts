import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { extractMemories } from "@/lib/memory";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extract durable memories from pasted text / a conversation. Uses AI → metered.
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });
  const gate = await chargeForMode("document");
  if (!gate.ok) { const d = creditDenial(gate, "Extracting memories"); return NextResponse.json(d.body, { status: d.status }); }
  const b = await req.json().catch(() => ({}));
  const res = await extractMemories(orgId, String(b.text || ""), user?.id ?? null);
  return NextResponse.json({ ok: true, ...res });
}
