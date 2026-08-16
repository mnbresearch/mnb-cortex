import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { brandFrom, brandReplyTo } from "@/lib/branded-email";
import { PLANS } from "@/lib/config";

/**
 * Renewal reminders.
 *
 * Paid plans expire at the end of the period they were bought for, and there is
 * no auto-charge — Cashfree here takes one-off orders, not mandates. Until now
 * the only warning was an in-app banner from 7 days out, so a customer who
 * didn't sign in that week would find the product switched off with no notice.
 *
 * Runs from the existing daily cron (Vercel Hobby allows one cron a day), and
 * every send is guarded by a unique row in `renewal_notices` so a reminder goes
 * out exactly once per period no matter how often the cron runs.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
const DAY = 86_400_000;
const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Notice = "t7" | "t1" | "lapsed";

function planLabel(id: string): string {
  return PLANS.find((p) => p.id === String(id || "").toLowerCase())?.name || "your";
}

function render(kind: Notice, firstName: string, plan: string, endsAt: Date, daysLeft: number): { subject: string; html: string } {
  const when = endsAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const C_FROM = "#1f4a3b", C_TO = "#2f6b54";

  const copy = kind === "lapsed"
    ? {
        subject: `Your MNB Cortex ${plan} plan has ended`,
        lead: `Your ${plan} plan ended on ${when}, so Cortex is paused.`,
        body: "Nothing has been deleted — your workspace, data and Cortex Memory are exactly as you left them, and everything comes straight back the moment you renew.",
        cta: "Renew my plan",
      }
    : kind === "t1"
    ? {
        subject: `Your MNB Cortex ${plan} plan ends tomorrow`,
        lead: `Your ${plan} plan ends on ${when} — that's tomorrow.`,
        body: "There's no automatic charge, so it will simply pause unless you renew. It takes about a minute and your data is untouched either way.",
        cta: "Renew now",
      }
    : {
        subject: `Your MNB Cortex ${plan} plan renews in ${daysLeft} days`,
        lead: `Your ${plan} plan runs until ${when} — about ${daysLeft} days away.`,
        body: "We don't auto-charge your card, so renewing is a deliberate step. Renew early and the new period stacks on top of what's left — you lose nothing.",
        cta: "Renew my plan",
      };

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td style="background:linear-gradient(135deg,${C_FROM},${C_TO});padding:24px 28px">
    <div style="font-size:21px;font-weight:800;color:#fff">MNB Cortex</div>
    <div style="font-size:13px;color:#d9ece3;margin-top:3px">Your subscription</div>
  </td></tr>
  <tr><td style="padding:24px 28px 6px;color:#1a2420;font-size:15px;line-height:1.6">
    <p style="margin:0 0 10px">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 10px"><b>${esc(copy.lead)}</b></p>
    <p style="margin:0 0 10px;color:#4a5a53">${esc(copy.body)}</p>
  </td></tr>
  <tr><td style="padding:8px 28px 24px">
    <a href="${APP_URL}/billing" style="display:inline-block;background:${C_TO};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:9px">${esc(copy.cta)} →</a>
  </td></tr>
  <tr><td style="padding:0 28px 24px;color:#8a978f;font-size:12px;line-height:1.5">
    You're receiving this because you have a paid MNB Cortex workspace. Questions? Just reply to this email.
  </td></tr>
</table></td></tr></table></body></html>`;

  return { subject: copy.subject, html };
}

/** Owner/admin email addresses for a workspace, best first. */
async function billingContact(svc: any, orgId: string): Promise<{ email: string; name: string } | null> {
  try {
    const { data: mems } = await svc
      .from("memberships").select("user_id, role").eq("org_id", orgId).in("role", ["owner", "admin"]).limit(5);
    for (const m of ((mems as any[]) || []).sort((a) => (a.role === "owner" ? -1 : 1))) {
      const { data } = await svc.auth.admin.getUserById(m.user_id);
      const email = data?.user?.email;
      if (email) {
        const meta: any = data?.user?.user_metadata || {};
        const raw = String(meta.full_name || "").trim() || email.split("@")[0];
        return { email, name: raw.split(/[\s._-]+/)[0].replace(/^./, (c: string) => c.toUpperCase()) };
      }
    }
  } catch { /* fall through */ }
  return null;
}

export type RenewalResult = { checked: number; sent: number; skipped: number; errors: number };

export async function sendRenewalReminders(): Promise<RenewalResult> {
  const out: RenewalResult = { checked: 0, sent: 0, skipped: 0, errors: 0 };
  const svc = serviceClient();
  if (!svc) return out;

  let orgs: any[] = [];
  try {
    const { data } = await svc
      .from("organizations")
      .select("id, name, plan, subscription_status, subscription_ends_at")
      .not("subscription_ends_at", "is", null)
      .limit(500);
    orgs = (data as any[]) || [];
  } catch { return out; }

  const now = Date.now();

  for (const o of orgs) {
    const end = new Date(o.subscription_ends_at).getTime();
    if (!Number.isFinite(end)) continue;
    out.checked++;

    const daysLeft = Math.ceil((end - now) / DAY);
    const status = String(o.subscription_status || "");

    // Which notice, if any, is due today.
    let kind: Notice | null = null;
    if (status === "active" && daysLeft <= 7 && daysLeft > 1) kind = "t7";
    else if (status === "active" && daysLeft <= 1 && daysLeft >= 0) kind = "t1";
    else if (status === "expired" && end < now && now - end < 3 * DAY) kind = "lapsed";
    if (!kind) { out.skipped++; continue; }

    // Claim the send FIRST. The unique index means a second cron run — or two
    // overlapping ones — cannot send the same notice twice.
    const { error: claimErr } = await svc.from("renewal_notices")
      .insert({ org_id: o.id, kind, period_end: o.subscription_ends_at });
    if (claimErr) { out.skipped++; continue; } // already sent for this period

    const contact = await billingContact(svc, o.id);
    if (!contact) { out.errors++; continue; }

    const { subject, html } = render(kind, contact.name, planLabel(o.plan), new Date(end), Math.max(0, daysLeft));
    const res = await sendEmail(contact.email, subject, html, { from: brandFrom(), replyTo: brandReplyTo() });

    if (res.sent) {
      out.sent++;
      try { await svc.from("renewal_notices").update({ sent_to: contact.email }).eq("org_id", o.id).eq("kind", kind).eq("period_end", o.subscription_ends_at); } catch {}
    } else {
      out.errors++;
      // Release the claim so tomorrow's run retries rather than skipping forever.
      try { await svc.from("renewal_notices").delete().eq("org_id", o.id).eq("kind", kind).eq("period_end", o.subscription_ends_at); } catch {}
    }
  }

  return out;
}
