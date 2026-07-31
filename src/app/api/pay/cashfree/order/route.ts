import { NextResponse } from "next/server";
import { createOrder, hasCashfree } from "@/lib/pay/cashfree";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { PLANS, CREDIT_PACKS } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hasCashfree()) return NextResponse.json({ ok: false, needsConfig: true, error: "Online payments aren't set up yet. Contact sales, or your admin can add Cashfree keys." });
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace first." });
  const b = await req.json().catch(() => ({} as any));
  const origin = new URL(req.url).origin;

  let amount = 0, note = "", returnPath = "/billing";
  if (b.kind === "credits") {
    const pack = CREDIT_PACKS.find((p) => p.id === b.packId);
    if (!pack) return NextResponse.json({ ok: false, error: "Unknown pack." });
    amount = pack.price; note = `credits:${pack.id}`; returnPath = "/usage";
  } else {
    const plan = PLANS.find((p) => p.id === b.plan || p.name === b.plan);
    if (!plan || plan.monthly === 0) return NextResponse.json({ ok: false, error: "Contact sales for this plan." });
    const annual = Boolean(b.annual);
    amount = annual ? plan.annual : plan.monthly;
    note = `plan:${plan.id}:${annual ? "annual" : "monthly"}`;
  }

  const profile = await getOrgProfile();
  const res = await createOrder({
    amount, note, returnUrl: `${origin}${returnPath}`,
    customer: { id: orgId, email: (profile as any)?.userEmail || user?.email || undefined, name: (profile as any)?.name },
  });
  return NextResponse.json(res);
}
