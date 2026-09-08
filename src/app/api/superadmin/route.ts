import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { provisionBusinesses, grantOrgAccess, joinOrg, manageOrg, recomputeOrg, provisionCustomer, setCollectionsSwitch } from "@/lib/superadmin-actions";

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
    if (op === "recompute") return NextResponse.json(await recomputeOrg(String(body.org_id || "")));
    /*
      The collections kill switch. Routed through here rather than imported
      directly by the panel: superadmin-actions.ts carries `server-only`, and a
      "use client" component that imports it fails the build — which is exactly
      what scripts/test-boundaries.mjs exists to catch, and did.
    */
    if (op === "collectionsSwitch") {
      const fd = new FormData();
      fd.set("on", body.on ? "1" : "0");
      fd.set("reason", String(body.reason || ""));
      return NextResponse.json(await setCollectionsSwitch(fd));
    }
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
