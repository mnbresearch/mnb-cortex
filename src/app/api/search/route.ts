import { NextResponse } from "next/server";
import { searchAll } from "@/lib/data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  try { return NextResponse.json({ results: await searchAll(q) }); }
  catch { return NextResponse.json({ results: [] }); }
}
