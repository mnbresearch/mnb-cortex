import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { remember, listMemories, updateMemory, setPinned, archiveMemory, supersedeMemory, recall, canWriteMemory, memoryUpgradeMessage } from "@/lib/memory";
import { hasRole } from "@/lib/roles";

/* Memory writes go through the service client, so RLS cannot stop a viewer — this does. */
const RANK_DENIED = { ok: false, error: "Changing Cortex Memory needs the analyst role or higher." };

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
  if (!(await hasRole("analyst"))) return NextResponse.json(RANK_DENIED, { status: 403 });
  /* Say WHY a write is refused — "Remembered" for a refused write was the bug. */
  if (!(await canWriteMemory(orgId))) return NextResponse.json({ ok: false, upgrade: true, error: await memoryUpgradeMessage() }, { status: 200 });
  const b = await req.json().catch(() => ({}));
  const content = String((b as any).content || "");
  if (!content.trim()) return NextResponse.json({ ok: false, error: "There is nothing to remember in an empty note." }, { status: 200 });
  const m = await remember({
    orgId, author: user?.id ?? null, content, title: b.title, kind: b.kind,
    entities: Array.isArray(b.entities) ? b.entities : (b.entities ? String(b.entities).split(",").map((s: string) => s.trim()) : []),
    tags: Array.isArray(b.tags) ? b.tags : (b.tags ? String(b.tags).split(",").map((s: string) => s.trim()) : []),
    importance: b.importance, source: b.source || "manual", source_ref: b.source_ref,
  });
  return NextResponse.json(m ? { ok: true, memory: m } : { ok: false, memory: null, error: "Could not save that memory — please try again." });
}

export async function PATCH(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false }, { status: 200 });
  if (!(await hasRole("analyst"))) return NextResponse.json(RANK_DENIED, { status: 403 });
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
