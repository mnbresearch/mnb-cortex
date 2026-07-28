import { NextResponse } from "next/server";
import { CREDIT_PACKS } from "@/lib/config";
import { getUserAndOrg } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates a Razorpay order for a credit pack. Degrades gracefully when
// payments aren't configured — the super-admin can still grant credits manually.
export async function POST(req: Request) {
  const { packId } = await req.json().catch(() => ({}));
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) return NextResponse.json({ ok: false, error: "Unknown pack." });

  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace first." });

  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) {
    return NextResponse.json({ ok: false, needsSales: true, error: "Online payment isn't set up yet. Ask your account manager to add credits, or contact sales." });
  }

  try {
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") },
      body: JSON.stringify({ amount: pack.price * 100, currency: "INR", receipt: "credits_" + Date.now(), notes: { packId: pack.id, credits: String(pack.credits) } }),
    });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ ok: false, error: j?.error?.description || "Order failed." });
    return NextResponse.json({ ok: true, orderId: j.id, keyId: id, amount: pack.price * 100, packId: pack.id, credits: pack.credits });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message });
  }
}
