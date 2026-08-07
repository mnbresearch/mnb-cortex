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
  return NextResponse.json({ ok: true });
}
