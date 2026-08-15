import { NextResponse } from "next/server";
import { generateFor } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";
import { recallContext } from "@/lib/memory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { mode, input } = await req.json();
    const m = String(mode || "pulse");
    const gate = await chargeForMode(m);
    if (!gate.ok) {
      const d = creditDenial(gate, "This action");
      return NextResponse.json({ ...d.body, text: d.body.error }, { status: d.status });
    }
    const context = await getBusinessContext();
    const { orgId } = await getUserAndOrg();
    const mem = await recallContext(orgId, String(input || m), 8);
    const fullContext = mem ? `${context}\n\n${mem}` : context;
    const text = await generateFor(m, String(input || ""), fullContext);
    return NextResponse.json({ text, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ text: "Could not run the AI — check the API key.", error: e?.message }, { status: 200 });
  }
}
