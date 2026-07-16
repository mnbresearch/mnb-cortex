import { NextResponse } from "next/server";
import { generateFor } from "@/lib/ai/cortex";
import { getBusinessContext } from "@/lib/data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { mode, input } = await req.json();
    const context = await getBusinessContext();
    const text = await generateFor(String(mode || "pulse"), String(input || ""), context);
    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ text: "Could not run the AI — check the API key.", error: e?.message }, { status: 200 });
  }
}
