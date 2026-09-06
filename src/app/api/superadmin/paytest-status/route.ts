import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { getUserAndOrg } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { PAYMENTS_TABLE } from "@/lib/pay/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read the outcome of the ₹1 test out of the database.
 *
 * Deliberately reads the LEDGER and the payments row, not the checkout
 * response. The whole reason this test exists is that the success screen was
 * not trustworthy: the webhook returned 200 on a failed grant, so every layer
 * above it reported success while nothing had been granted. Asking the page
 * that just took the money whether the money worked is how that stayed hidden.
 *
 * `claimCount` is the one to watch. More than one payments row for a single
 * order id means the idempotency guard did not hold, which is the failure that
 * costs the most and shows the least.
 */
export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ ok: false, error: "Not permitted." }, { status: 403 });
  }

  const { orgId } = await getUserAndOrg();
  const svc = serviceClient();
  if (!orgId || !svc) return NextResponse.json({ ok: false, error: "No workspace or service role." });

  const { data: org } = await svc.from("organizations").select("credits").eq("id", orgId).maybeSingle();
  const credits = Number((org as any)?.credits ?? 0);

  /* Most recent test order for this workspace. */
  const { data: rows } = await svc.from(PAYMENTS_TABLE)
    .select("order_id, status, amount, kind, ref, created_at")
    .eq("org_id", orgId).eq("ref", "pack_test")
    .order("created_at", { ascending: false }).limit(1);
  const payment = (rows as any[])?.[0] ?? null;

  let claimCount = 0;
  let ledgerReason: string | null = null;
  if (payment?.order_id) {
    /* How many claim rows exist for this exact order. Must be 1. */
    const { count } = await svc.from(PAYMENTS_TABLE)
      .select("order_id", { count: "exact", head: true })
      .eq("order_id", payment.order_id);
    claimCount = Number(count ?? 0);

    /* And the grant itself — the ledger reason embeds the order id, so this
       proves the credit came from THIS payment and not from an allowance
       top-up that happened to land at the same moment. */
    const { data: led } = await svc.from("credit_ledger")
      .select("reason, delta, balance_after")
      .eq("org_id", orgId).like("reason", `topup:pack_test:${payment.order_id}`).limit(1);
    const l = (led as any[])?.[0];
    ledgerReason = l ? `${l.reason} (delta ${l.delta}, balance ${l.balance_after})` : "NOT FOUND";
  }

  return NextResponse.json({ ok: true, credits, payment, claimCount, ledgerReason });
}
