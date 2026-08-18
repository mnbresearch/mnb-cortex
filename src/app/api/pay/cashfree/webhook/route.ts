import { NextResponse } from "next/server";
import crypto from "crypto";
import { settleOrder } from "@/lib/pay/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cashfree Payment Gateway webhook — the RELIABLE activation path.
 *
 * Cashfree signs each webhook: signature = base64(HMAC-SHA256(timestamp + rawBody, SECRET)).
 * We verify it against CASHFREE_SECRET_KEY before trusting anything, then settle the
 * order idempotently. Set this URL in the Cashfree dashboard → Developers → Webhooks:
 *   https://cortex.mnbresearch.com/api/pay/cashfree/webhook
 */
export async function POST(req: Request) {
  const secret = process.env.CASHFREE_SECRET_KEY || "";
  if (!secret) return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });

  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";
  const timestamp = req.headers.get("x-webhook-timestamp") || "";

  // Verify signature (constant-time). Reject anything that doesn't match.
  let valid = false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(timestamp + raw).digest("base64");
    valid = signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { valid = false; }
  if (!valid) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });

  let body: any = {};
  try { body = JSON.parse(raw); } catch { /* ignore */ }
  const type = String(body?.type || "");
  const orderId = String(body?.data?.order?.order_id || body?.data?.order_id || "");

  // Only act on a successful payment; ack everything else so Cashfree stops retrying.
  if (orderId && /PAYMENT_SUCCESS|SUCCESS/i.test(type)) {
    try { await settleOrder(orderId); } catch { /* settle is idempotent; safe to drop */ }
  }

  // Recurring debits arrive as SUBSCRIPTION_* events rather than orders. Each
  // successful cycle must EXTEND the paid period, or auto-renewal would charge
  // the customer and still lock them out.
  if (/SUBSCRIPTION/i.test(type)) {
    try { await handleSubscriptionEvent(type, body); } catch { /* ack anyway */ }
  }

  return NextResponse.json({ ok: true });
}

/** Extend (or suspend) the workspace behind a subscription mandate. */
async function handleSubscriptionEvent(type: string, body: any) {
  const { serviceClient } = await import("@/lib/supabase/server");
  const svc = serviceClient();
  if (!svc) return;

  const sub = body?.data?.subscription || body?.data || {};
  const ref = String(sub.subscription_id || body?.data?.subscription_id || "");
  if (!ref) return;

  const { data: org } = await svc.from("organizations")
    .select("id, subscription_ends_at, subscription_cycle").eq("subscription_ref", ref).maybeSingle();
  if (!org) return;
  const orgId = (org as any).id;

  const paid = /PAYMENT_SUCCESS|CHARGE_SUCCESS/i.test(type);
  const stopped = /CANCELL?ED|ON_HOLD|PAYMENT_DECLINED|FAILED/i.test(type);

  if (paid) {
    const annual = String((org as any).subscription_cycle || "monthly") === "annual";
    const days = annual ? 365 : 30;
    const cur = (org as any).subscription_ends_at ? new Date((org as any).subscription_ends_at).getTime() : 0;
    const from = Math.max(cur, Date.now());   // stack onto whatever is left
    await svc.from("organizations").update({
      subscription_status: "active",
      subscription_ends_at: new Date(from + days * 86_400_000).toISOString(),
      autorenew_status: "ACTIVE",
      autorenew_next: sub.subscription_next_scheduled_time || null,
    }).eq("id", orgId);

    const { emitQuietly } = await import("@/lib/webhooks");
    emitQuietly(orgId, "payment.succeeded", { kind: "subscription", subscription_id: ref, event: type });
  } else if (stopped) {
    // The mandate stopped. The already-paid period stands; we simply stop
    // promising future renewals.
    await svc.from("organizations").update({ autorenew_status: /CANCELL?ED/i.test(type) ? "CANCELLED" : "ON_HOLD" }).eq("id", orgId);
  }
}
