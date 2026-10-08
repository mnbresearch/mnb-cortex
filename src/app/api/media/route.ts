import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { listMedia } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  GET /api/media — this workspace's generated images and videos, newest first.
  Files are private; each item carries our own /api/media/<id> URL, which
  checks membership before handing out a short-lived signed link.
*/
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to see your library." }, { status: 401 });
  const { rows, missing } = await listMedia(orgId);
  return NextResponse.json({
    ok: true,
    migrated: !missing,
    items: rows.map((r) => ({
      id: r.id, kind: r.kind, status: r.status, title: r.title, agentId: r.agent_id, aspect: r.aspect,
      createdAt: r.created_at, operation: r.status === "running" ? r.operation : null,
      url: r.status === "done" ? (r.storage_path ? `/api/media/${r.id}` : r.result_uri ? `/api/agents/video?file=${encodeURIComponent(r.result_uri)}` : null) : null,
      mime: r.mime,
    })),
  });
}
