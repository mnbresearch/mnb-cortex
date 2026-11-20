import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { chunk } from "@/lib/knowledge/core";
import { extractText, MAX_FILE_BYTES } from "@/lib/knowledge/files";
import { listSources, createSource, upsertItems, knowledgeReady, KNOWLEDGE_SETUP, type SourceRow } from "@/lib/knowledge/store";
import { mayConnect } from "@/lib/knowledge/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
  POST /api/knowledge/upload — multipart, field "files" (up to 10, 15 MB each).
  Each file's text is extracted, chunked and stored under the workspace's
  "Documents" source; uploading a file with the same name replaces it.
  Manager and above.
*/
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("manager"))) return NextResponse.json({ ok: false, error: "Uploading company documents needs the manager role or higher." }, { status: 403 });
  if (!(await knowledgeReady())) return NextResponse.json({ ok: false, setup: true, error: KNOWLEDGE_SETUP });
  const gate = await mayConnect(orgId, "upload");
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: 402 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") || []).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f).slice(0, 10);
  if (!files.length) return NextResponse.json({ ok: false, error: "Choose at least one file." }, { status: 400 });

  let source: SourceRow | undefined = (await listSources(orgId)).find((s) => s.provider === "upload");
  if (!source) {
    const r = await createSource({ orgId, userId: user.id, provider: "upload", label: "Documents", scopes: ["files"] });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    source = r.source;
  }

  const results: { name: string; ok: boolean; parts?: number; error?: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) { results.push({ name: f.name, ok: false, error: "Over 15 MB." }); continue; }
    const x = await extractText(f.name, new Uint8Array(await f.arrayBuffer()), f.type);
    if (!x.ok) { results.push({ name: f.name, ok: false, error: x.error }); continue; }
    const parts = chunk(x.text);
    if (!parts.length) { results.push({ name: f.name, ok: false, error: "No text found." }); continue; }
    const key = `upload:${f.name.toLowerCase()}`;
    await upsertItems(source, parts.map((c, i) => ({
      kind: "document", external_id: parts.length > 1 ? `${key}#${i}` : key, title: f.name, author: user.email || null,
      occurred_at: new Date().toISOString(), url: null, content: c, metadata: { app: "Uploaded document", part: i + 1, parts: parts.length, bytes: f.size },
    })));
    results.push({ name: f.name, ok: true, parts: parts.length });
  }
  return NextResponse.json({ ok: results.some((r) => r.ok), results });
}
