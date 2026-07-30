import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { listCustomAgents, listRuns, activatedAgentIds } from "@/lib/agents/runtime";
import { imageGenGate } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ custom: [], runs: [], imageQuota: null, activated: [] });
  const [custom, runs, ig, activated] = await Promise.all([listCustomAgents(orgId), listRuns(orgId, 20), imageGenGate(), activatedAgentIds(orgId)]);
  const imageQuota = { limit: ig.limit, used: ig.used, left: ig.limit < 0 ? -1 : Math.max(0, ig.limit - ig.used), active: ig.active, plan: ig.plan };
  return NextResponse.json({ custom, runs, imageQuota, activated });
}
