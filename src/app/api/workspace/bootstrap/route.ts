import { NextResponse } from "next/server";
import { ensureWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the login flow right after sign-in / sign-up so a workspace exists
// before we drop the user into the dashboard.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const res = await ensureWorkspace({ name: body?.company || body?.name, industry: body?.industry });
  return NextResponse.json(res);
}
