import { NextResponse } from "next/server";
import { getCreditState } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight state read for the low-balance banner and client widgets.
export async function GET() {
  try {
    return NextResponse.json(await getCreditState());
  } catch (e: any) {
    return NextResponse.json({ known: false, enforceable: false, unlimited: true, balance: 0, allowance: 0, plan: "watch", resetAt: null });
  }
}
