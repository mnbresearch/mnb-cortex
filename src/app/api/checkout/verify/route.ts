import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, amount } = body;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "not configured" });
  const expected = createHmac("sha256", secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  if (expected !== razorpay_signature) return NextResponse.json({ ok: false, error: "signature mismatch" });
  const { orgId } = await getUserAndOrg();
  if (orgId) {
    const sb = createClient();
    await sb.from("organizations").update({ plan: String(plan || "").toLowerCase() }).eq("id", orgId);
    await sb.from("subscriptions").insert({ org_id: orgId, plan, status: "active", provider: "razorpay", amount: (amount || 0) / 100, reference: razorpay_payment_id });
  }
  return NextResponse.json({ ok: true });
}
