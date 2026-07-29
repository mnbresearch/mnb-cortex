import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { listCustomAgents, listRuns } from "@/lib/agents/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ custom: [], runs: [] });
  const [custom, runs] = await Promise.all([listCustomAgents(orgId), listRuns(orgId, 20)]);
  return NextResponse.json({ custom, runs });
}
