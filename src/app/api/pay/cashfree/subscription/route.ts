import { NextResponse } from "next/server";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { createSubscription, cancelSubscription, getSubscription, hasSubscriptions } from "@/lib/pay/subscription";
import { enforce } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { plan, annual, phone } -> authorisation link. DELETE -> cancel auto-renew. */
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to set up auto-renewal." }, { status: 401 });

  /*
    Billing is an ADMIN action, and none of these routes checked a role.

    Any member \u2014 including a viewer, a role handed to junior staff and in
    Practice mode to the client \u2014 could set up a recurring mandate against the
    workspace. Worse than the mandate itself is what the success path does
    below: it overwrites `organizations.subscription_ref`. The previous mandate
    is NOT cancelled, so Cashfree keeps debiting the customer for it, but its
    renewal webhooks then look up the org by the new ref and find nothing
    (`if (!org) return` in the webhook) \u2014 the customer is charged every cycle
    and receives nothing, with no error raised anywhere.

    So: admin, matching every other billing surface.
  */
  const { hasRole } = await import("@/lib/roles");
  if (!(await hasRole("admin"))) {
    return NextResponse.json(
      { ok: false, error: "Only an admin or owner can set up auto-renewal." }, { status: 403 });
  }

  if (!hasSubscriptions()) return NextResponse.json({ ok: false, needsConfig: true, error: "Online payments aren\u2019t set up yet." }, { status: 200 });

  /*
    Refuse to clobber a live mandate. Replacing the ref while the old mandate is
    still active is the orphaning bug described above; the customer has to
    cancel first, which also stops the debits.
  */
  try {
    const { data: cur } = await serviceClient()!.from("organizations")
      .select("subscription_ref, autorenew_status").eq("id", orgId).maybeSingle();
    const existing = (cur as any)?.subscription_ref;
    const status = String((cur as any)?.autorenew_status || "").toUpperCase();
    if (existing && !["CANCELLED", "EXPIRED", "FAILED", ""].includes(status)) {
      return NextResponse.json({
        ok: false,
        error: "Auto-renewal is already set up for this workspace. Turn the existing one off before creating a new mandate, or you will be charged for both.",
      }, { status: 409 });
    }
  } catch { /* cannot read \u2014 fall through rather than block a first-time setup */ }

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

  /* A viewer could cancel the workspace's auto-renewal. The paid period
     survives, so this is not destructive — but it silently sets the workspace
     up to lapse at the end of the cycle, and the owner has no reason to look. */
  const { hasRole } = await import("@/lib/roles");
  if (!(await hasRole("admin"))) {
    return NextResponse.json(
      { ok: false, error: "Only an admin or owner can turn off auto-renewal." }, { status: 403 });
  }

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

  /*
    ASK CASHFREE ONLY ABOUT OUR OWN SUBSCRIPTION.

    The write below is correctly scoped — `.eq("id", orgId).eq("subscription_ref", ref)`
    means no entitlement can be diverted. The READ was not scoped at all: any
    signed-in user could pass any `sub` and we would query it with the merchant
    credentials and return its status, plan, cycle and next charge date. That is
    a lookup against our Cashfree account on a stranger's behalf, and it is the
    one billing route that skipped the check its siblings all make (see
    /verify, which refuses another workspace's order outright).

    Confirm ownership from OUR row first, then call out.
  */
  const svcRead = serviceClient();
  const { data: own } = svcRead
    ? await svcRead.from("organizations").select("id").eq("id", orgId).eq("subscription_ref", ref).maybeSingle()
    : { data: null as any };
  if (!own) {
    return NextResponse.json({ ok: false, error: "That subscription belongs to a different workspace." }, { status: 403 });
  }

  /*
    And a limit. Each call is an outbound authenticated request to Cashfree, so
    an unbounded loop burns our API quota from a free account. Reconciling after
    an authorisation happens once or twice; 60/hour is far above that.
  */
  const over = await enforce([{ key: `pay:sub:org:${orgId}`, limit: 60, windowSecs: 3600 }]);
  if (over) return NextResponse.json({ ok: false, error: "Too many status checks. Refresh this page in a minute." }, { status: 429 });

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
