import { NextResponse } from "next/server";
import { getAlerts } from "@/lib/data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const alerts = await getAlerts();
  return NextResponse.json({ alerts });
}
