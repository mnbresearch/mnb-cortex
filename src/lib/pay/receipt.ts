import "server-only";
import { sendEmail } from "@/lib/email";
import { serviceClient } from "@/lib/supabase/server";
import { inr } from "@/lib/utils";

/**
 * Our own payment receipt, in our own name.
 *
 * WHY THIS EXISTS.
 *
 * The gateway's confirmation email carries the MERCHANT ACCOUNT'S identity, not
 * the product's — and that account is shared, so a customer buying MNB Cortex
 * received a receipt headed with a different product's name. Nothing in this
 * codebase produced that: Cortex sends Cashfree only an order id, an amount,
 * customer details and an internal note. It is an account-level setting, and it
 * is not reachable from here.
 *
 * What IS reachable is sending our own. So the customer now gets a receipt from
 * MNB Cortex that names the product, the plan or pack, the amount and the order
 * id, whatever the gateway's own mail happens to say.
 *
 * That is worth doing even after the dashboard is corrected. A payment
 * confirmation from the party you think you bought from is the single cheapest
 * defence against "I don't recognise this charge" — the most common chargeback
 * reason code — and it gives the customer the order id they need in order to
 * ask us about it rather than their bank.
 *
 * Best-effort by construction. It is called after the grant has already
 * committed, and a mail failure must never affect whether the customer got what
 * they paid for.
 */

export async function sendPaymentReceipt(input: {
  orgId: string;
  orderId: string;
  amount: number;
  kind: "plan" | "credits" | string;
  /** Plan id or credit-pack id. */
  ref: string;
  /** Human label: "Watch Pro (annual)" or "2,000 credits". */
  label?: string;
  /** For plans, when the paid period now ends. */
  endsAt?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const svc = serviceClient();
  if (!svc) return { sent: false, reason: "no service role" };

  /*
    The billing contact is the workspace OWNER, not whoever happened to click
    pay. On a Practice account the person completing a purchase may be staff,
    and the receipt belongs with whoever is accountable for the spend.
  */
  let to = "";
  let orgName = "your workspace";
  try {
    const { data: org } = await svc.from("organizations").select("name").eq("id", input.orgId).maybeSingle();
    orgName = String((org as any)?.name || orgName);

    const { data: members } = await svc.from("memberships")
      .select("user_id, role").eq("org_id", input.orgId).eq("role", "owner").limit(1);
    const ownerId = (members as any[])?.[0]?.user_id;
    if (ownerId) {
      const { data: u } = await svc.auth.admin.getUserById(ownerId);
      to = String(u?.user?.email || "");
    }
  } catch { /* fall through — no address, no receipt, no harm */ }

  if (!to) return { sent: false, reason: "no owner email" };

  const what = input.label
    || (input.kind === "plan" ? `the ${input.ref} plan` : `credit pack ${input.ref}`);

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 4px;font-size:18px">Payment received — MNB Cortex</h2>
      <p style="margin:0 0 16px;color:#666;font-size:13px">${orgName}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#666">What you bought</td><td style="padding:6px 0;text-align:right"><b>${what}</b></td></tr>
        <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;text-align:right"><b>${inr(input.amount)}</b></td></tr>
        <tr><td style="padding:6px 0;color:#666">Order ID</td><td style="padding:6px 0;text-align:right;font-family:ui-monospace,monospace;font-size:12px">${input.orderId}</td></tr>
        ${input.endsAt ? `<tr><td style="padding:6px 0;color:#666">Paid until</td><td style="padding:6px 0;text-align:right">${new Date(input.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</td></tr>` : ""}
      </table>

      <!--
        The statement line is stated up front, deliberately. The card statement
        shows the merchant entity, not the product name, and a customer who does
        not recognise it goes to their bank rather than to us.
      -->
      <p style="margin:16px 0 0;padding:12px;background:#f6f6f6;border-radius:8px;font-size:13px;color:#444">
        On your card or bank statement this will appear as
        <b>ABROBOT TECHNOLOGIES</b> — the company behind MNB Cortex.
        If anything looks wrong, reply to this email with the order ID above and we will sort it out.
      </p>

      <p style="margin:16px 0 0;font-size:12px;color:#888">
        Abrobot Technologies Pvt Ltd · MNB Cortex · contact@mnbresearch.com
      </p>
    </div>`;

  return sendEmail(to, `Payment received — ${what} · MNB Cortex`, html);
}
