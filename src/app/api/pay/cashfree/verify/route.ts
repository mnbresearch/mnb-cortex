import { NextResponse } from "next/server";
import { getOrder } from "@/lib/pay/cashfree";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { grantCredits } from "@/lib/credits";
import { CREDIT_PACKS } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verify a Cashfree order server-side, then activate the plan or grant credits.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as any));
  const orderId = String(b.orderId || "");
  if (!orderId) return NextResponse.json({ ok: false, error: "Missing order." });

  const order = await getOrder(orderId);
  if (!order.paid) return NextResponse.json({ ok: false, pending: true, error: "Payment not completed yet." });

  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "No workspace." });

  const [type, a, b2] = order.note.split(":");
  try {
    if (type === "plan") {
      const sb = createClient();
      await sb.from("organizations").update({ plan: a, subscription_status: "active" }).eq("id", orgId);
      try { await sb.from("subscriptions").insert({ org_id: orgId, plan: a, status: "active", provider: "cashfree", amount: order.amount, reference: orderId }); } catch {}
      return NextResponse.json({ ok: true, kind: "plan", plan: a, cycle: b2 });
    }
    if (type === "credits") {
      const pack = CREDIT_PACKS.find((p) => p.id === a);
      if (pack) { const bal = await grantCredits(orgId, pack.credits, "topup:" + pack.id, user?.id); return NextResponse.json({ ok: true, kind: "credits", credits: pack.credits, balance: bal }); }
    }
    return NextResponse.json({ ok: false, error: "Unknown order type." });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Activation failed." });
  }
}
