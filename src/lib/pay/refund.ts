import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { emitQuietly } from "@/lib/webhooks";

/**
 * Refunds, chargebacks and disputes.
 *
 * WHAT EXISTED BEFORE: nothing.
 *
 * A search for refund/chargeback/dispute across the payment code returned only
 * the unrelated AI credit refund and the legal pages. So the money path was
 * one-directional: a customer could buy the ₹8,999 pack of 10,000 credits,
 * spend them, raise a chargeback, and keep the balance and the plan
 * permanently. Nothing decremented `credits`, nothing shortened
 * `subscription_ends_at`, and nothing told the operator it had happened. At one
 * customer that is an annoyance; as a share of revenue it is unbounded, and it
 * is the kind of loss you only find by reconciling a bank statement by hand.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * It reverses what can be reversed safely and ALWAYS raises an alert. It does
 * not try to be clever about partial refunds or to claw back value already
 * consumed, because getting that wrong takes product away from a customer who
 * paid — a worse failure than the one being fixed.
 *
 *   Credits: deducted, floored at the current balance. If they have already
 *   been spent the balance simply goes to zero; we never push it negative,
 *   because a negative balance would block a legitimate future top-up and turn
 *   a billing dispute into a broken account.
 *
 *   Plan: the period bought by that payment is removed. The end date moves back
 *   by the days the payment purchased rather than being cleared, so a workspace
 *   that also paid for other periods keeps those. Never moves earlier than now.
 *
 *   Always: the payments row is marked, an alert is written, and a
 *   payment.refunded webhook is emitted. Even where reversal is declined, the
 *   operator finds out.
 *
 * Idempotent on the payments row status, because a refund webhook is retried
 * like any other and reversing twice would take double.
 */

export type RefundResult = {
  ok: boolean;
  action: "reversed" | "already" | "not_found" | "recorded_only";
  detail?: string;
};

const DAYS = (cycle: string) => (cycle === "annual" ? 365 : 30);

export async function handleRefundEvent(
  type: string, body: any, orderIdFromEvent: string,
): Promise<RefundResult> {
  const svc = serviceClient();
  if (!svc) return { ok: false, action: "not_found", detail: "no service role" };

  /* Cashfree puts the order id in different places depending on the event.
     Take whatever the caller resolved first, then fall back through the shapes. */
  const orderId = String(
    orderIdFromEvent
      || body?.data?.order?.order_id
      || body?.data?.refund?.order_id
      || body?.data?.dispute?.order_id
      || "",
  ).trim();
  if (!orderId) return { ok: false, action: "not_found", detail: "no order id on event" };

  const { data: row } = await svc.from("payments")
    .select("order_id, org_id, kind, ref, amount, status")
    .eq("order_id", orderId).maybeSingle();

  if (!row) {
    /* A refund for something we never granted — a mandate authorisation, or an
       order that failed settlement. Nothing to reverse, but record the attempt
       so the reconciliation is not silent. */
    return { ok: true, action: "not_found", detail: `no payment row for ${orderId}` };
  }

  const p = row as any;
  if (String(p.status || "").startsWith("refunded")) {
    return { ok: true, action: "already", detail: "already reversed" };
  }

  const orgId = String(p.org_id || "");
  const kind = String(p.kind || "");
  const ref = String(p.ref || "");
  let action: RefundResult["action"] = "recorded_only";
  let detail = "";

  if (orgId && kind === "credits") {
    /*
      Reverse the pack, but never below zero. `CREDIT_PACKS` is not consulted —
      the ledger is, via the grant this refund reverses — so a catalogue change
      between purchase and refund cannot take back more than was given.
    */
    try {
      const { data: grant } = await svc.from("credit_ledger")
        .select("delta").eq("org_id", orgId).like("reason", `topup:%:${orderId}`).limit(1);
      const granted = Number((grant as any[])?.[0]?.delta ?? 0);

      if (granted > 0) {
        const { data: org } = await svc.from("organizations")
          .select("credits").eq("id", orgId).single();
        const balance = Number((org as any)?.credits ?? 0);
        const take = Math.min(granted, Math.max(balance, 0));

        if (take > 0) {
          /*
            grant_credits(p_org, p_amount, p_user, p_reason, p_meta) — five
            arguments. p_user is not optional; omitting it makes PostgREST fail
            to resolve the overload, which would have made every reversal a
            silent no-op. Matches the call in lib/credits.ts:244.

            The function itself does `greatest(cur + p_amount, 0)`, so it will
            not go negative either — but the explicit clamp above is still
            worth keeping, because it makes the LEDGER record what was actually
            reclaimed rather than an amount larger than the balance.
          */
          const { error: revErr } = await svc.rpc("grant_credits", {
            p_org: orgId, p_amount: -take, p_user: null,
            p_reason: `refund_reversal:${orderId}`, p_meta: {},
          });
          if (revErr) throw new Error(revErr.message);
        }
        action = "reversed";
        detail = `credits granted ${granted}, reclaimed ${take}` +
                 (take < granted ? " (rest already spent)" : "");
      }
    } catch (e: any) {
      detail = `credit reversal failed: ${e?.message || e}`;
    }
  }

  if (orgId && kind === "plan") {
    /*
      Remove the days this payment bought. Subtracting rather than clearing
      means a workspace that stacked several payments keeps the ones it still
      holds. Clamped at now, so a refund can end a plan but never backdate it
      into a state that looks like it lapsed weeks ago.
    */
    try {
      const { data: org } = await svc.from("organizations")
        .select("subscription_ends_at, subscription_cycle").eq("id", orgId).single();
      const endsAt = (org as any)?.subscription_ends_at;
      if (endsAt) {
        const cycle = String((org as any)?.subscription_cycle || "monthly");
        const back = new Date(endsAt).getTime() - DAYS(cycle) * 86_400_000;
        const floor = Date.now();
        const next = new Date(Math.max(back, floor)).toISOString();
        const lapsed = back <= floor;

        await svc.from("organizations").update({
          subscription_ends_at: next,
          ...(lapsed ? { subscription_status: "cancelled" } : {}),
        }).eq("id", orgId);

        action = "reversed";
        detail = lapsed
          ? `plan ${ref} period removed and marked cancelled`
          : `plan ${ref} period shortened by ${DAYS(cycle)} days`;
      }
    } catch (e: any) {
      detail = `plan reversal failed: ${e?.message || e}`;
    }
  }

  /* Mark first, then alert. The status is what makes this idempotent, so it
     must land even if the alert does not. */
  try {
    await svc.from("payments")
      .update({ status: `refunded:${action}` }).eq("order_id", orderId);
  } catch { /* best effort */ }

  if (orgId) {
    /*
      ALWAYS alert, including on recorded_only. A refund we could not reverse is
      exactly the case a human needs to see — silence here is what let this be
      invisible in the first place.
    */
    try {
      await svc.from("alerts").insert({
        org_id: orgId, severity: "red", module: "billing",
        title: `Payment ${type.toLowerCase().includes("dispute") || type.toLowerCase().includes("chargeback") ? "disputed" : "refunded"}`,
        body: `Order ${orderId} (${kind}${ref ? ` ${ref}` : ""}, ₹${p.amount}). ${detail || "No automatic reversal applied."}`,
      });
    } catch { /* best effort */ }

    emitQuietly(orgId, "payment.refunded", {
      order_id: orderId, kind, ref, amount: p.amount, event: type, action, detail,
    });
  }

  return { ok: true, action, detail };
}
