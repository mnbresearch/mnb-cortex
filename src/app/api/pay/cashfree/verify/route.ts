import { NextResponse } from "next/server";
import { settleOrder } from "@/lib/pay/settle";
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
  const over = await enforce([{ key: `pay:verify:org:${orgId}`, limit: 60, windowSecs: 3600 }]);
  if (over) {
    return NextResponse.json(
      { ok: false, error: "Too many verification attempts. Your payment is safe — refresh this page in a minute, or the webhook will activate it automatically." },
      { status: 429 },
    );
  }

  const res = await settleOrder(orderId);

  /*
    Do not report on another workspace's order.

    settleOrder is keyed to the order's own customer_id, so no entitlement can
    be diverted — the grant always goes to the workspace that paid. But the
    RESULT was returned to whoever asked, which let any signed-in user probe an
    order id and learn its plan, amount and settlement state. Nothing about
    another business's purchases belongs in this response.
  */
  if (res.ok && (res as any).orgId && (res as any).orgId !== orgId) {
    return NextResponse.json({ ok: false, error: "That order belongs to a different workspace." }, { status: 403 });
  }

  return NextResponse.json(res);
}
