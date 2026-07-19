import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { provisionBusinesses, grantOrgAccess, joinOrg } from "@/lib/superadmin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!(await isSuperAdmin())) {
      return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({} as any));
    const op = String(body?.op || "");
    if (op === "provision") return NextResponse.json(await provisionBusinesses());
    if (op === "grant") return NextResponse.json(await grantOrgAccess(String(body.org_id || ""), String(body.email || ""), String(body.role || "admin")));
    if (op === "join") return NextResponse.json(await joinOrg(String(body.org_id || "")));
    return NextResponse.json({ ok: false, error: "Unknown operation" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
