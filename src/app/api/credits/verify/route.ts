import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { CREDIT_PACKS } from "@/lib/config";
import { getUserAndOrg } from "@/lib/data";
import { grantCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifies a Razorpay payment and grants the purchased credit pack.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packId } = body;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "not configured" });

  const expected = createHmac("sha256", secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  if (expected !== razorpay_signature) return NextResponse.json({ ok: false, error: "signature mismatch" });

  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) return NextResponse.json({ ok: false, error: "unknown pack" });

  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "no workspace" });

  try {
    const balance = await grantCredits(orgId, pack.credits, "topup:" + pack.id, user?.id);
    return NextResponse.json({ ok: true, credits: pack.credits, balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "grant failed" });
  }
}
