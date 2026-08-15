import "server-only";
import { getOrder } from "@/lib/pay/cashfree";
import { serviceClient } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/credits";
import { PLANS, CREDIT_PACKS } from "@/lib/config";

export type SettleResult = {
  ok: boolean;
  pending?: boolean;
  already?: boolean;
  kind?: "plan" | "credits";
  plan?: string;
  cycle?: string;
  endsAt?: string;
  credits?: number;
  balance?: number;
  error?: string;
};

/**
 * Verify a Cashfree order server-side and activate it EXACTLY ONCE.
 *
 * Safe to call from the return-page verify AND the webhook, concurrently and
 * repeatedly — the `payments` table (order_id PK) is the idempotency guard, so
 * credits/plan can never be granted twice. The order's own customer_id (which we
 * set to the org id at creation) is the source of truth for which workspace to
 * credit, so the webhook needs no user session.
 */
export async function settleOrder(orderId: string): Promise<SettleResult> {
  if (!orderId) return { ok: false, error: "Missing order." };
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Service role not configured." };

  const order = await getOrder(orderId);
  if (!order.paid) return { ok: false, pending: true, error: "Payment not completed yet." };

  const orgId = (order.customerId || "").trim();
  if (!orgId) return { ok: false, error: "Order is not linked to a workspace." };

  const [type, ref, cycle] = order.note.split(":");

  // Cross-check the amount actually paid against the catalogue price for that
  // plan/pack — defends against any tampered or stale order.
  let expected = 0;
  if (type === "plan") {
    const p = PLANS.find((x) => x.id === ref);
    expected = p ? (cycle === "annual" ? p.annual : p.monthly) : 0;
  } else if (type === "credits") {
    const pk = CREDIT_PACKS.find((x) => x.id === ref);
    expected = pk ? pk.price : 0;
  }
  if (expected > 0 && order.amount + 1 < expected) {
    // Underpaid — record for audit, do NOT grant.
    await svc.from("payments").upsert(
      { order_id: orderId, org_id: orgId, kind: type, ref, amount: order.amount, status: "amount_mismatch" },
      { onConflict: "order_id", ignoreDuplicates: true },
    );
    return { ok: false, error: "Payment amount did not match the plan price." };
  }

  // Claim the order idempotently. If a row already existed, `data` is empty and
  // we must NOT grant again.
  const { data: claimed, error: claimErr } = await svc.from("payments").upsert(
    { order_id: orderId, org_id: orgId, kind: type, ref, amount: order.amount, status: "paid" },
    { onConflict: "order_id", ignoreDuplicates: true },
  ).select("order_id");
  if (claimErr) return { ok: false, error: claimErr.message };
  const isNew = Array.isArray(claimed) && claimed.length > 0;

  if (type === "plan") {
    if (!PLANS.find((x) => x.id === ref)) return { ok: false, error: "Unknown plan." };
    if (isNew) {
      // A paid plan runs for a fixed period and then lapses — one payment must not
      // buy the product forever. If the workspace is already inside a paid period,
      // stack the new one on top of it rather than truncating what they've paid for.
      const days = cycle === "annual" ? 365 : 30;
      let from = Date.now();
      try {
        const { data: cur } = await svc.from("organizations").select("subscription_ends_at").eq("id", orgId).single();
        const existing = (cur as any)?.subscription_ends_at ? new Date((cur as any).subscription_ends_at).getTime() : 0;
        if (existing > from) from = existing;
      } catch { /* column not migrated yet — start from now */ }
      const endsAt = new Date(from + days * 86_400_000).toISOString();

      const patch: Record<string, any> = { plan: ref, subscription_status: "active" };
      const { error: withPeriod } = await svc.from("organizations")
        .update({ ...patch, subscription_ends_at: endsAt, subscription_cycle: cycle === "annual" ? "annual" : "monthly" })
        .eq("id", orgId);
      // Migration-safe: if the period columns don't exist yet, still activate the plan.
      if (withPeriod) await svc.from("organizations").update(patch).eq("id", orgId);

      try { await svc.from("subscriptions").insert({ org_id: orgId, plan: ref, status: "active", provider: "cashfree", amount: order.amount, reference: orderId }); } catch { /* audit only */ }
      return { ok: true, kind: "plan", plan: ref, cycle, endsAt };
    }
    return { ok: true, already: true, kind: "plan", plan: ref, cycle };
  }

  if (type === "credits") {
    const pack = CREDIT_PACKS.find((p) => p.id === ref);
    if (!pack) return { ok: false, error: "Unknown credit pack." };
    if (isNew) {
      const balance = await grantCredits(orgId, pack.credits, "topup:" + pack.id, null);
      return { ok: true, kind: "credits", credits: pack.credits, balance };
    }
    return { ok: true, already: true, kind: "credits", credits: pack.credits };
  }

  return { ok: false, error: "Unknown order type." };
}
