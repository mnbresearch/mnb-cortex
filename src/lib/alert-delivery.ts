import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { brandFrom, renderBrandedEmail } from "@/lib/branded-email";
import type { Budget } from "@/lib/cron-budget";

/**
 * Send the alerts that have been raised, instead of waiting to be noticed.
 *
 * WHAT WAS WRONG.
 *
 * `metrics.ts` evaluates every KPI rule and inserts a row into `alerts` when
 * one breaches. The autopilot cron does the same for its daily analysis. And
 * that is where it stopped — nothing emailed, nothing messaged, no push.
 *
 * The product's own copy says the owner will "get warned the moment a number
 * crosses your line". What actually happened was that the owner got warned IF
 * HE LOGGED IN AND LOOKED. An alert that requires you to open the app to
 * discover it is a dashboard, not a COO — and the whole premise of Cortex is
 * that it tells you things you would otherwise have missed.
 *
 * WHY A DIGEST RATHER THAN ONE EMAIL PER ALERT.
 *
 * Because the failure mode of alerting is not silence, it is noise. A workspace
 * with eight rules can breach several at once on a bad month; eight separate
 * emails in a minute teaches the owner to filter the sender, after which the
 * feature is worse than useless. One message listing everything new, at most
 * once a day, is the version that survives contact with a real inbox.
 */

/** One email per workspace per day, at most, however many alerts fired. */
const MIN_GAP_MS = 20 * 60 * 60 * 1000;

/** Cap the workspaces touched in one cron invocation. */
const MAX_ORGS = 200;

export type DeliveryResult = { orgs: number; sent: number; alerts: number };

/**
 * The address a workspace's automated mail should go to.
 *
 * Exported because the workflow scheduler needs exactly this and was doing
 * without: it called executeWorkflow() with no ownerEmail, so every `email`
 * step in a SCHEDULED run short-circuited on "No owner email on file" while the
 * same workflow run by hand worked fine. Every demo workflow the product ships
 * ends in an email step, so "workflow automation on a schedule" failed silently
 * every night for the canonical case.
 *
 * One implementation, not two — an owner-resolution rule that differs between
 * two callers is one that is wrong in one of them.
 */
export async function ownerEmail(svc: any, orgId: string): Promise<string | null> {
  try {
    const { data: mems } = await svc.from("memberships")
      .select("user_id, role").eq("org_id", orgId).in("role", ["owner", "admin"]).limit(3);
    for (const m of ((mems as any[]) || []).sort((a: any) => (a.role === "owner" ? -1 : 1))) {
      const { data } = await svc.auth.admin.getUserById(m.user_id);
      if (data?.user?.email) return data.user.email;
    }
  } catch { /* fall through */ }
  return null;
}

const SEVERITY_LABEL: Record<string, string> = {
  red: "Needs attention now",
  yellow: "Worth a look",
  green: "For information",
};

export async function deliverAlerts(origin?: string, budget?: Budget): Promise<DeliveryResult> {
  const svc = serviceClient();
  if (!svc) return { orgs: 0, sent: 0, alerts: 0 };

  /*
    Only UNREAD, UNSENT alerts from the last two days.

    The window matters. Without it, switching this on would email every
    workspace its entire alert history — the single worst first impression a
    notification feature can make. Two days also means a workspace that was
    quiet yesterday gets nothing rather than a stale digest.
  */
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  let rows: any[] = [];
  try {
    const { data } = await svc.from("alerts")
      .select("id, org_id, severity, title, body, created_at, notified_at")
      .eq("is_read", false)
      .is("notified_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    rows = (data as any[]) || [];
  } catch {
    // `notified_at` not migrated yet. Doing nothing is correct: without a way to
    // record that an alert was sent, running would re-send the same ones daily.
    return { orgs: 0, sent: 0, alerts: 0 };
  }
  if (!rows.length) return { orgs: 0, sent: 0, alerts: 0 };

  const byOrg = new Map<string, any[]>();
  for (const a of rows) {
    if (!byOrg.has(a.org_id)) byOrg.set(a.org_id, []);
    byOrg.get(a.org_id)!.push(a);
  }

  let sent = 0, alerts = 0;
  const now = Date.now();

  for (const [orgId, list] of Array.from(byOrg).slice(0, MAX_ORGS)) {
    // One workspace is an owner lookup plus a send: ~1.5s. Unsent alerts keep
    // their null notified_at and are picked up tomorrow.
    if (budget && !budget.ok(2_000)) break;
    /*
      Mark as notified BEFORE sending, exactly as the workflow scheduler claims
      before running. If the send throws after a successful delivery, the worst
      case is one digest the owner does not get again — versus the same digest
      every day, which is how a useful alert becomes spam.
    */
    const ids = list.map((a) => a.id);
    let claimed = false;
    try {
      const { data: upd } = await svc.from("alerts")
        .update({ notified_at: new Date(now).toISOString() })
        .in("id", ids).is("notified_at", null).select("id");
      claimed = Array.isArray(upd) && upd.length > 0;
      if (claimed && upd) { ids.length = 0; ids.push(...upd.map((u: any) => u.id)); }
    } catch { claimed = false; }
    if (!claimed) continue;

    /*
      EVERY PATH OUT OF THIS LOOP AFTER THE CLAIM MUST RELEASE IT.

      The comment 40 lines below already argues this case — "an alert silently
      marked 'delivered' and never delivered is the single worst state a row can
      be in" — and the release was wired into exactly ONE of the four exits, the
      Resend-failure branch. Two `continue` statements sitting between the claim
      and the send skipped it entirely:

        - the daily-gap check, which is a DEFERRAL. Those alerts were meant to
          go out tomorrow. Instead they were stamped notified, and the query at
          the top of this function filters on `.is("notified_at", null)`, so
          tomorrow never came for them. Any workspace that got a digest within
          the last 20 hours had its next batch destroyed rather than delayed.
        - a workspace with no owner email, which is a config problem that should
          resolve the moment someone confirms an address — and instead silently
          consumed the alerts raised while it was unresolved.

      Both are recoverable states being treated as terminal, which is the exact
      inversion of what the claim is for. One helper, called on every exit.
    */
    const release = async () => {
      try { await svc.from("alerts").update({ notified_at: null }).in("id", ids); }
      catch { /* it will age out of the `since` window; nothing better to do */ }
    };

    // Respect the per-workspace daily gap using the org's own last digest.
    try {
      const { data: recent } = await svc.from("alerts")
        .select("notified_at").eq("org_id", orgId).not("notified_at", "is", null)
        .not("id", "in", `(${ids.join(",")})`)
        .order("notified_at", { ascending: false }).limit(1);
      const last = (recent as any[])?.[0]?.notified_at;
      if (last && now - new Date(last).getTime() < MIN_GAP_MS) { await release(); continue; }
    } catch { /* no history — proceed */ }

    const to = await ownerEmail(svc, orgId);
    if (!to) { await release(); continue; }

    const ordered = list.slice().sort((a, b) => {
      const rank = (s: string) => (s === "red" ? 0 : s === "yellow" ? 1 : 2);
      return rank(a.severity) - rank(b.severity);
    });

    const lines = ordered.slice(0, 12).map((a) =>
      `${SEVERITY_LABEL[a.severity] || "Alert"} — ${a.title}${a.body ? `\n${String(a.body).slice(0, 240)}` : ""}`
    );
    const more = ordered.length > 12 ? `\n\n…and ${ordered.length - 12} more in the app.` : "";

    const body =
      `${ordered.length === 1 ? "One thing" : `${ordered.length} things`} crossed a line you set.\n\n` +
      lines.join("\n\n") + more +
      `\n\nOpen Cortex to see the numbers behind these and mark them handled.`;

    try {
      const html = renderBrandedEmail(body, { origin, preheader: ordered[0]?.title });
      const subject = ordered.length === 1
        ? `Cortex alert: ${ordered[0].title}`.slice(0, 120)
        : `Cortex: ${ordered.length} alerts need your attention`;
      const res = await sendEmail(to, subject, html, { from: brandFrom() });
      if (res.sent) { sent++; alerts += ordered.length; }
      else {
        /*
          RELEASE THE CLAIM WHEN NOTHING WAS SENT.

          The claim above is correct — marking before sending is what stops the
          same digest going out every night. But it was never released, so a
          Resend outage marked these alerts notified forever and the owner was
          never told a KPI had crossed a line they set. On an early-warning
          product, an alert silently marked "delivered" and never delivered is
          the single worst state a row can be in.

          renewal-email.ts already does this correctly; alert delivery did not.
          Releasing only on a KNOWN failure keeps the duplicate-suppression
          property: if the send threw after Resend accepted it, we still leave
          the claim in place and prefer a missed repeat over a daily repeat.
        */
        await release();
      }
    } catch { /* threw after a possible delivery — keep the claim, see above */ }
  }

  return { orgs: byOrg.size, sent, alerts };
}
