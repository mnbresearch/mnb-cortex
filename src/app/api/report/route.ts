import { NextResponse } from "next/server";
import { generateReport } from "@/lib/ai/cortex";
import { getBusinessContext } from "@/lib/data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const context = await getBusinessContext();
    const report = await generateReport(context);
    return NextResponse.json({ report });
  } catch (e: any) {
    return NextResponse.json({ report: "Could not generate the report — check the AI key.", error: e?.message }, { status: 200 });
  }
}
