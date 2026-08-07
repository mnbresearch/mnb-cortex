import { NextResponse } from "next/server";
import { settleOrder } from "@/lib/pay/settle";
import { getUserAndOrg } from "@/lib/data";

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

  const res = await settleOrder(orderId);
  return NextResponse.json(res);
}
