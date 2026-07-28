import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { listMemories, listEntities, getProfile } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full memory export — data ownership. The workspace's memories, entities & profile.
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ memories: [], entities: [], profile: null });
  const [memories, entities, profile] = await Promise.all([
    listMemories(orgId, { limit: 5000 }), listEntities(orgId), getProfile(orgId),
  ]);
  return NextResponse.json({
    exported_at: new Date().toISOString(),
    counts: { memories: memories.length, entities: entities.length },
    profile: (profile as any)?.profile_md ?? null,
    memories, entities,
  });
}
