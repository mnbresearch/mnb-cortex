import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { provisionBusinesses, grantOrgAccess, joinOrg, manageOrg, provisionCustomer } from "@/lib/superadmin-actions";

const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : undefined);

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
    if (op === "provisionCustomer") return NextResponse.json(await provisionCustomer({
      email: String(body.email || ""),
      name: body.name ? String(body.name) : undefined,
      company: body.company ? String(body.company) : undefined,
      plan: body.plan ? String(body.plan) : undefined,
      credits: num(body.credits),
      industry: body.industry ? String(body.industry) : undefined,
    }));
    if (op === "join") return NextResponse.json(await joinOrg(String(body.org_id || "")));
    if (op === "manage") return NextResponse.json(await manageOrg(String(body.org_id || ""), {
      plan: body.plan ? String(body.plan) : undefined,
      subscription_status: body.subscription_status ? String(body.subscription_status) : undefined,
      creditsDelta: num(body.creditsDelta),
      creditsSet: num(body.creditsSet),
      creditsAllowance: num(body.creditsAllowance),
      extendTrialDays: num(body.extendTrialDays),
      subscriptionDays: num(body.subscriptionDays),
    }));
    return NextResponse.json({ ok: false, error: "Unknown operation" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
