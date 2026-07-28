import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { remember, listMemories, updateMemory, setPinned, archiveMemory, supersedeMemory, recall } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ items: [] });
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const kind = url.searchParams.get("kind") || undefined;
  const entity = url.searchParams.get("entity") || undefined;
  const mode = url.searchParams.get("mode"); // "recall" for ranked retrieval
  if (mode === "recall" && q) {
    return NextResponse.json({ items: await recall(orgId, q, { limit: 12 }) });
  }
  return NextResponse.json({ items: await listMemories(orgId, { q: q || undefined, kind, entity }) });
}

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." }, { status: 200 });
  const b = await req.json().catch(() => ({}));
  const m = await remember({
    orgId, author: user?.id ?? null, content: String(b.content || ""), title: b.title, kind: b.kind,
    entities: Array.isArray(b.entities) ? b.entities : (b.entities ? String(b.entities).split(",").map((s: string) => s.trim()) : []),
    tags: Array.isArray(b.tags) ? b.tags : (b.tags ? String(b.tags).split(",").map((s: string) => s.trim()) : []),
    importance: b.importance, source: b.source || "manual", source_ref: b.source_ref,
  });
  return NextResponse.json({ ok: Boolean(m), memory: m });
}

export async function PATCH(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false }, { status: 200 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ ok: false, error: "id required" });
  if (b.op === "pin") return NextResponse.json({ ok: await setPinned(orgId, b.id, Boolean(b.pinned)) });
  if (b.op === "archive") return NextResponse.json({ ok: await archiveMemory(orgId, b.id) });
  if (b.op === "supersede") {
    const m = await supersedeMemory(orgId, b.id, { content: String(b.content || ""), title: b.title, kind: b.kind, importance: b.importance });
    return NextResponse.json({ ok: Boolean(m), memory: m });
  }
  return NextResponse.json({ ok: await updateMemory(orgId, b.id, b.patch || {}) });
}
