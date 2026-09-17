import { NextResponse } from "next/server";
import { settleOrder } from "@/lib/pay/settle";
import { getOrder } from "@/lib/pay/cashfree";
import { getUserAndOrg } from "@/lib/data";
import { enforce } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Return-page verification. Confirms the order server-side and activates it
// (idempotently). The webhook is the reliable path; this makes activation feel
// instant when the user lands back on the return URL.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as any));
  const orderId = String(b.orderId || "");
  if (!orderId) return NextResponse.json({ ok: false, error: "Missing order." });

  // The caller must be signed into a workspace (defence in depth; the settle
  // itself is keyed to the order's own customer_id).
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to your workspace first." });

  /*
    RATE LIMITED, because this endpoint calls out to Cashfree.

    No route under /api/pay had any limit. Every call here triggers an outbound
    authenticated GET to Cashfree's order API, so an unbounded loop is both an
    order-id enumeration oracle (ids are `mnb_<ms>_<5 chars>`, and the response
    distinguishes "paid", "already settled" and "unknown") and a way to burn our
    API quota from a free account. 60/hour is far above returning from a
    checkout — which happens once or twice per purchase — and far below useful
    enumeration.
  */
  /*
    ADMIN, like the route that STARTS a payment.

    This took membership as sufficient while /api/pay/cashfree/order requires
    admin — so the endpoint that begins a purchase was better guarded than the
    one that activates it. That asymmetry stopped being cosmetic when settle
    learned to repair a grant: driving this endpoint writes to
    `organizations.plan` and `subscription_ends_at`, and a viewer — the role you
    give a bookkeeper — could aim it at any order id belonging to the
    workspace. The repair window bounds what that can do; the role check is
    what makes it nobody's business but an admin's.

    It costs the customer nothing: the webhook is the reliable activation path,
    and a non-admin returning from checkout simply sees the page update a few
    seconds later instead of instantly.
  */
  const { hasRole } = await import("@/lib/roles");
  if (!(await hasRole("admin"))) {
    return NextResponse.json(
      { ok: false, error: "Only an admin or owner can confirm a payment. It will activate automatically in a moment." },
      { status: 403 },
    );
  }

  const over = await enforce([{ key: `pay:verify:org:${orgId}`, limit: 60, windowSecs: 3600 }]);
  if (over) {
    return NextResponse.json(
      { ok: false, error: "Too many verification attempts. Your payment is safe — refresh this page in a minute, or the webhook will activate it automatically." },
      { status: 429 },
    );
  }

  /*
    OWNERSHIP FIRST, THEN SETTLE. The order of these two was wrong.

    This used to call settleOrder() and only then compare the order's workspace
    to the caller's. No entitlement was ever divertible — the grant is keyed to
    the order's own customer_id — but it meant any signed-in user could drive
    the full grant path, including its writes, against a STRANGER's order, sixty
    times an hour. The 403 below was closing the response while leaving the
    side effects open.

    One extra read from Cashfree buys the check. The webhook remains the
    reliable activation path, so a stranger being refused here costs the real
    customer nothing.
  */
  const probe = await getOrder(orderId);
  if (probe.unknown) {
    return NextResponse.json(
      { ok: false, retryable: true, error: "We could not reach the payment provider. Your payment is safe — refresh in a minute, or the webhook will activate it automatically." },
      { status: 503 },
    );
  }
  const owner = (probe.customerId || "").trim();
  if (owner && owner !== orgId) {
    return NextResponse.json({ ok: false, error: "That order belongs to a different workspace." }, { status: 403 });
  }

  const res = await settleOrder(orderId);

  /* Belt and braces: settleOrder resolves the workspace from the order itself,
     so if the two ever disagree with the probe above, say nothing about it. */
  if ((res as any).orgId && (res as any).orgId !== orgId) {
    return NextResponse.json({ ok: false, error: "That order belongs to a different workspace." }, { status: 403 });
  }

  return NextResponse.json(res);
}
