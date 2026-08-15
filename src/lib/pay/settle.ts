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

  // If we didn't claim it, make sure the existing row is actually a PAID one.
  // An earlier 'amount_mismatch' row would otherwise make every later attempt
  // report "already settled" while nothing was ever activated.
  if (!isNew) {
    const { data: prior } = await svc.from("payments").select("status").eq("order_id", orderId).maybeSingle();
    const priorStatus = String((prior as any)?.status || "");
    if (priorStatus && priorStatus !== "paid") {
      return { ok: false, error: `This order was previously recorded as "${priorStatus}" and cannot be activated. Please contact support.` };
    }
  }

  /** Release our claim so a webhook retry can settle this order again. */
  const releaseClaim = async () => {
    if (!isNew) return;
    try { await svc.from("payments").delete().eq("order_id", orderId); } catch { /* best effort */ }
  };

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

      if (withPeriod) {
        // Only fall back for a genuinely missing column (the migration hasn't run
        // yet). Falling back on ANY error would turn a transient failure into a
        // permanent, never-expiring plan that was paid for once.
        const missingColumn = withPeriod.code === "PGRST204" || withPeriod.code === "42703"
          || /column .* does not exist/i.test(withPeriod.message || "");
        if (!missingColumn) {
          await releaseClaim(); // let the webhook retry settle this order properly
          return { ok: false, error: withPeriod.message || "Could not activate the plan." };
        }
        const retry = await svc.from("organizations").update(patch).eq("id", orgId);
        if (retry.error) { await releaseClaim(); return { ok: false, error: retry.error.message }; }
      }

      try { await svc.from("subscriptions").insert({ org_id: orgId, plan: ref, status: "active", provider: "cashfree", amount: order.amount, reference: orderId }); } catch { /* audit only */ }
      return { ok: true, kind: "plan", plan: ref, cycle, endsAt };
    }
    return { ok: true, already: true, kind: "plan", plan: ref, cycle };
  }

  if (type === "credits") {
    const pack = CREDIT_PACKS.find((p) => p.id === ref);
    if (!pack) return { ok: false, error: "Unknown credit pack." };
    if (isNew) {
      try {
        const balance = await grantCredits(orgId, pack.credits, "topup:" + pack.id, null);
        return { ok: true, kind: "credits", credits: pack.credits, balance };
      } catch (e: any) {
        // The customer paid but we couldn't credit them — release the claim so
        // the webhook retry grants the pack instead of reporting "already done".
        await releaseClaim();
        return { ok: false, error: e?.message || "Could not add the credits. Please contact support." };
      }
    }
    return { ok: true, already: true, kind: "credits", credits: pack.credits };
  }

  return { ok: false, error: "Unknown order type." };
}
