import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { searchKnowledge } from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The row picker: find documents, emails and files in Company Knowledge. */
export async function GET(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") || "").slice(0, 200);
  const kind = u.searchParams.get("kind") || undefined;
  const hits = await searchKnowledge(orgId, q, { limit: 20, kind: kind && ["document", "file", "email", "chat", "report", "record"].includes(kind) ? kind : undefined });
  return NextResponse.json({ ok: true, items: hits.map((h) => ({ id: h.id, title: h.title, citation: h.citation, kind: h.kind, date: h.date })) });
}
