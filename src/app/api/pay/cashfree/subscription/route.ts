import { NextResponse } from "next/server";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { createSubscription, cancelSubscription, getSubscription, hasSubscriptions } from "@/lib/pay/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { plan, annual, phone } -> authorisation link. DELETE -> cancel auto-renew. */
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to set up auto-renewal." }, { status: 401 });
  if (!hasSubscriptions()) return NextResponse.json({ ok: false, needsConfig: true, error: "Online payments aren\u2019t set up yet." }, { status: 200 });

  const b = await req.json().catch(() => ({} as any));
  const profile = await getOrgProfile();
  const digits = String(b.phone || (profile as any)?.billing_phone || "").replace(/\D/g, "").slice(-10);

  const origin = new URL(req.url).origin;
  const res = await createSubscription({
    orgId,
    planId: String(b.plan || "").toLowerCase(),
    annual: Boolean(b.annual),
    customer: {
      email: (profile as any)?.userEmail || user?.email || undefined,
      phone: /^[6-9]\d{9}$/.test(digits) ? digits : undefined,
      name: (profile as any)?.name,
    },
    returnUrl: `${origin}/billing?sub={subscription_id}`,
  });

  if (res.ok && res.subscriptionId) {
    try {
      await serviceClient()?.from("organizations")
        .update({ subscription_ref: res.subscriptionId, autorenew_status: "INITIALIZED" })
        .eq("id", orgId);
    } catch { /* the mandate still works; we\u2019ll reconcile on return */ }
  }
  return NextResponse.json(res);
}

/** Turn auto-renewal off. The already-paid period is untouched. */
export async function DELETE() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const svc = serviceClient();
  const { data } = await svc!.from("organizations").select("subscription_ref").eq("id", orgId).maybeSingle();
  const ref = (data as any)?.subscription_ref;
  if (!ref) return NextResponse.json({ ok: true, note: "Auto-renewal wasn\u2019t on." });

  const res = await cancelSubscription(ref);
  if (res.ok) {
    try { await svc!.from("organizations").update({ autorenew_status: "CANCELLED", autorenew_next: null }).eq("id", orgId); } catch {}
  }
  return NextResponse.json(res);
}

/** Reconcile status after the customer returns from authorising. */
export async function GET(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false }, { status: 401 });
  const ref = new URL(req.url).searchParams.get("sub");
  if (!ref) return NextResponse.json({ ok: false, error: "Missing subscription id." }, { status: 400 });

  const st = await getSubscription(ref);
  if (st.ok) {
    try {
      await serviceClient()?.from("organizations")
        .update({ autorenew_status: st.status || null, autorenew_next: st.nextCharge || null })
        .eq("id", orgId).eq("subscription_ref", ref);
    } catch { /* display-only */ }
  }
  return NextResponse.json(st);
}
