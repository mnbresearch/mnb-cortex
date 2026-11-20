import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { searchKnowledge, knowledgeReady, KNOWLEDGE_SETUP } from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/* GET /api/knowledge/search?q=…&kind=… — the same search agents use, with citations. Free. */
export async function GET(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await knowledgeReady())) return NextResponse.json({ ok: false, setup: true, error: KNOWLEDGE_SETUP });
  const u = new URL(req.url);
  const hits = await searchKnowledge(orgId, String(u.searchParams.get("q") || ""), { limit: 15, kind: u.searchParams.get("kind") || undefined });
  return NextResponse.json({ ok: true, hits });
}
