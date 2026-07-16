import { NextResponse } from "next/server";
import { PLANS } from "@/lib/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { plan, annual } = await req.json().catch(() => ({}));
  const p = PLANS.find((x) => x.name === plan);
  if (!p || p.monthly === 0) return NextResponse.json({ ok: false, error: "Contact sales for this plan." });
  const id = process.env.RAZORPAY_KEY_ID; const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) return NextResponse.json({ ok: false, error: "Payments not configured. Contact sales." });
  const amount = (annual ? p.annual : p.monthly) * 100; // paise
  try {
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") },
      body: JSON.stringify({ amount, currency: "INR", receipt: "mnb_" + Date.now() }),
    });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ ok: false, error: j?.error?.description || "order failed" });
    return NextResponse.json({ ok: true, orderId: j.id, keyId: id, amount, plan: p.name });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e?.message }); }
}
