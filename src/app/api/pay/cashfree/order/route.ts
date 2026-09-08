import { NextResponse } from "next/server";
import { createOrder, hasCashfree } from "@/lib/pay/cashfree";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { PLANS, CREDIT_PACKS } from "@/lib/config";
import { recordQuietly } from "@/lib/funnel";
import { clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hasCashfree()) return NextResponse.json({ ok: false, needsConfig: true, error: "Online payments aren't set up yet. Contact sales, or your admin can add Cashfree keys." });
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace first." });

  /*
    ADMIN, like every other billing surface.

    This was the one route in /api/pay that took membership as sufficient, so a
    `viewer` — the role you hand a bookkeeper or an intern — could open a
    Cashfree checkout in the workspace's name. Nothing is charged without
    someone completing payment, so this is not a way to spend the company's
    money; it is a way to put the company's name and billing phone on an order
    page, and it is inconsistent with /subscription, which already refuses.
  */
  const { hasRole } = await import("@/lib/roles");
  if (!(await hasRole("admin"))) {
    return NextResponse.json({ ok: false, error: "Only an admin or owner can start a payment." }, { status: 403 });
  }
  const b = await req.json().catch(() => ({} as any));
  const origin = new URL(req.url).origin;

  let amount = 0, note = "", returnPath = "/billing";
  if (b.kind === "credits") {
    const pack = CREDIT_PACKS.find((p) => p.id === b.packId);
    if (!pack) return NextResponse.json({ ok: false, error: "Unknown pack." });

    /*
      A hidden pack is operator tooling and must not be orderable by knowing its
      id. Checked HERE, on the server, rather than by leaving it out of the UI —
      the pack list is a client bundle, so "not rendered" is not a control.
    */
    if (pack.hidden) {
      const { isSuperAdmin } = await import("@/lib/superadmin");
      if (!(await isSuperAdmin())) return NextResponse.json({ ok: false, error: "Unknown pack." });
    }

    amount = pack.price; note = `credits:${pack.id}`; returnPath = "/usage";
  } else {
    const plan = PLANS.find((p) => p.id === b.plan || p.name === b.plan);
    if (!plan || plan.monthly === 0) return NextResponse.json({ ok: false, error: "Contact sales for this plan." });
    const annual = Boolean(b.annual);
    amount = annual ? plan.annual : plan.monthly;
    note = `plan:${plan.id}:${annual ? "annual" : "monthly"}`;
  }

  /*
    NO ORDER MAY BE FOR ZERO — or for a negative number.

    The plan branch above guards `plan.monthly === 0` (the enterprise
    "contact sales" case) but not `plan.annual`. A plan with a monthly price and
    no annual price would therefore create a ₹0 order the moment someone
    toggled to annual billing: Cashfree would take it, the webhook would settle
    it, and the workspace would be granted a full paid period for nothing.

    Every plan in config.ts currently sets both, so this is a guard rather than
    a live bug — but it is one line, and the failure it prevents is silent, free
    subscriptions. Checking the ONE number that actually reaches the payment
    gateway is stronger than checking the two fields it was derived from.
  */
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "That plan is not available for this billing cycle. Please contact us." }, { status: 400 });
  }

  // A real 10-digit phone. Cashfree requires one; we used to invent it.
  const digits = String(b.phone || "").replace(/\D/g, "").slice(-10);
  const phone = /^[6-9]\d{9}$/.test(digits) ? digits : "";

  const profile = await getOrgProfile();
  // Remember it so the customer only ever types it once.
  if (phone && phone !== (profile as any)?.billing_phone) {
    try {
      const { serviceClient } = await import("@/lib/supabase/server");
      await serviceClient()?.from("organizations").update({ billing_phone: phone }).eq("id", orgId);
    } catch { /* not fatal — the order can still go through */ }
  }
  const customerPhone = phone || (profile as any)?.billing_phone || "";
  /*
    The step the funnel was most blind to. Until now nothing recorded that
    someone reached checkout, so "how many started paying and did not finish"
    had no answer at all — and that is the single most valuable number a
    pre-revenue SaaS can look at.
  */
  recordQuietly("checkout_started", {
    ip: clientIp(req),
    orgId,
    meta: { kind: b.kind === "credits" ? "credits" : "plan", ref: note.split(":")[1] || "", amount },
  });

  const res = await createOrder({
    amount, note, returnUrl: `${origin}${returnPath}`,
    customer: {
      id: orgId,
      email: (profile as any)?.userEmail || user?.email || undefined,
      name: (profile as any)?.name,
      phone: customerPhone || undefined,
    },
  });
  return NextResponse.json(res);
}
