import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { mediaById, signedUrl, deleteMedia, extFor } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/media/<id>[?download=1] — a short-lived signed link to the file, for members of its workspace only. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in." }, { status: 401 });
  const row = await mediaById(orgId, params.id);
  if (!row || !row.storage_path) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1"
    ? `${(row.title || row.kind).replace(/[^\w.-]+/g, "-").slice(0, 60) || row.kind}.${extFor(row.mime)}`
    : undefined;
  const url = await signedUrl(row.storage_path, 3600, download);
  if (!url) return NextResponse.json({ ok: false, error: "Could not open the file." }, { status: 502 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}

/** DELETE /api/media/<id> — analysts and above. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Your role can't delete from the library." }, { status: 403 });
  const r = await deleteMedia(orgId, params.id);
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
