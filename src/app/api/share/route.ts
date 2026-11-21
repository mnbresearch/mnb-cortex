import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { createShare, listShares, revokeShare, sharesReady, SHARE_KINDS, type ShareKind } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Live share links. GET ?kind=&ref= lists a thing's links; POST {kind, ref_id,
  days} creates one (the token is returned once); DELETE {id} revokes.
  Sharing outside the workspace is analyst and above.
*/
const kindOf = (k: unknown): ShareKind | null => (SHARE_KINDS as readonly string[]).includes(String(k)) ? (k as ShareKind) : null;

export async function GET(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const u = new URL(req.url); const kind = kindOf(u.searchParams.get("kind")); const ref = u.searchParams.get("ref") || "";
  if (!kind || !ref) return NextResponse.json({ ok: false, error: "kind and ref are required." }, { status: 400 });
  const ready = await sharesReady();
  return NextResponse.json({ ok: true, ready, links: ready ? await listShares(orgId, kind, ref) : [] });
}

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Sharing needs the analyst role or higher." }, { status: 403 });
  if (!(await sharesReady())) return NextResponse.json({ ok: false, error: "Share links need their table: run supabase/RUN-2026-11-20-shared-pages.sql." }, { status: 503 });
  const b = await req.json().catch(() => ({} as any));
  const kind = kindOf(b.kind); if (!kind) return NextResponse.json({ ok: false, error: "Unknown kind." }, { status: 400 });
  const r = await createShare(orgId, user.id, kind, String(b.ref_id || ""), Number(b.days) || 7);
  if (!r.ok) return NextResponse.json(r, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id, url: `${new URL(req.url).origin}/s/${r.token}`, expires_at: r.expires_at });
}

export async function DELETE(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Revoking needs the analyst role or higher." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  return NextResponse.json({ ok: await revokeShare(orgId, String(b.id || "")) });
}
