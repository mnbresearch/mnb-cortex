import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/operators";

/**
 * Tell the OPERATOR something went wrong. Not the customer.
 *
 * WHY THIS HAD TO EXIST.
 *
 * The refund handler ended with a comment that read "Even where reversal is
 * declined, the operator finds out", above code that inserted into `alerts`
 * with the customer's own org_id. `alerts` is the workspace's feed — the panel
 * a customer sees on their dashboard. So a chargeback notice went to the person
 * who had just charged back, and the one person who needed to know did not.
 *
 * Everything else on the money path had the same problem in a different shape:
 * `console.error`. A retired plan id being debited every month, a mandate with
 * no plan note, a grant that failed after the money was taken — all of them
 * wrote a line to a log that nobody reads, in a serverless runtime where
 * yesterday's logs are already gone.
 *
 * So there are two destinations here and they are not interchangeable:
 *
 *   operator_alerts — durable, queryable, shown in the superadmin console with
 *     an unresolved filter. This is the record. It must not depend on email
 *     delivery, because email is the least reliable part of the system.
 *
 *   email to ADMIN_EMAIL — the interrupt. Best effort by design: a failed send
 *     must never lose the row, and must never break the payment path that is
 *     calling this.
 *
 * NOTHING HERE THROWS. It is called from inside webhook handlers where the
 * money has already moved; an alerting failure must not turn a completed
 * payment into a 500 and a retry.
 */

export type OperatorAlert = {
  /** Machine-readable class, used by the console to group and by tests to assert. */
  kind: string;
  title: string;
  body?: string;
  /** "red" interrupts; "amber" is for things to look at today. */
  severity?: "red" | "amber";
  /** The workspace involved, when there is one. A refund for an order we have
   *  no record of has none — that is exactly the case that must still land. */
  orgId?: string | null;
  orderId?: string | null;
  /** Skip the email for high-volume or low-stakes classes. */
  email?: boolean;
};

export async function operatorAlert(a: OperatorAlert): Promise<{ recorded: boolean; emailed: boolean }> {
  let recorded = false;
  let emailed = false;

  const svc = serviceClient();
  if (svc) {
    try {
      /*
        Row count, not absence of error. A write that matches no rows or is
        silently refused by RLS returns no error from PostgREST, and this
        function's whole job is to be the place a failure cannot hide.
      */
      const { data, error } = await svc.from("operator_alerts").insert({
        kind: a.kind,
        title: a.title,
        body: a.body || null,
        severity: a.severity || "red",
        org_id: a.orgId || null,
        order_id: a.orderId || null,
      }).select("id");
      recorded = !error && Array.isArray(data) && data.length > 0;
      if (!recorded) {
        console.error("[operator-alert] NOT RECORDED:", a.kind, a.title, error?.message || "insert matched no rows");
      }
    } catch (e: any) {
      console.error("[operator-alert] insert threw:", a.kind, e?.message);
    }
  } else {
    console.error("[operator-alert] no service role; alert not recorded:", a.kind, a.title);
  }

  if (a.email !== false) {
    try {
      const { sendEmail } = await import("@/lib/email");
      const { renderBrandedEmail, brandFrom } = await import("@/lib/branded-email");
      const lines = [
        `<p><b>${escapeHtml(a.title)}</b></p>`,
        a.body ? `<p>${escapeHtml(a.body)}</p>` : "",
        a.orderId ? `<p>Order: <code>${escapeHtml(a.orderId)}</code></p>` : "",
        a.orgId ? `<p>Workspace: <code>${escapeHtml(a.orgId)}</code></p>` : "",
        `<p style="color:#666">Class: ${escapeHtml(a.kind)}. This is an operator notification — the customer was not sent this.</p>`,
      ].filter(Boolean).join("\n");
      const res = await sendEmail(
        process.env.OPS_NOTIFY_EMAIL || ADMIN_EMAIL,
        `[Cortex ops] ${a.title}`,
        renderBrandedEmail(lines, { preheader: a.body?.slice(0, 120) || a.title }),
        { from: brandFrom() },
      );
      /* sendEmail returns { sent }, never throws. Read the field it actually
         returns — `res.ok` would be undefined and every send would report as
         failed, which is its own small lie. */
      emailed = Boolean(res?.sent);
      if (!emailed) console.error("[operator-alert] email not sent:", res?.reason || "unknown");
    } catch (e: any) {
      console.error("[operator-alert] email failed (row still recorded):", e?.message);
    }
  }

  return { recorded, emailed };
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
