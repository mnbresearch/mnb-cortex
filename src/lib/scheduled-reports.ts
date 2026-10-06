import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { generateFor, generateReport } from "@/lib/ai/cortex";
import { withOrgAiKeys } from "@/lib/ai/byo";
import { sendEmail } from "@/lib/email";
import { brandFrom } from "@/lib/branded-email";
import { mdToHtml, escapeHtml } from "@/lib/utils";
import { emitQuietly } from "@/lib/webhooks";
import type { Budget } from "@/lib/cron-budget";

/**
 * Scheduled reports — "Custom dashboards & auto-reports" on the Premium plan,
 * which had no scheduler behind it.
 *
 * Runs off the single daily cron (Vercel Hobby allows one), and each report
 * decides for itself whether it's due. `last_sent` is the guard, so a cron that
 * fires twice in a day cannot send twice.
 */

const DAY = 86_400_000;

function isDue(cadence: string, lastSent: string | null): boolean {
  if (!lastSent) return true;
  const since = Date.now() - new Date(lastSent).getTime();
  if (!Number.isFinite(since)) return true;
  switch (cadence) {
    case "daily":   return since >= 0.9 * DAY;     // tolerate cron jitter
    case "monthly": return since >= 28 * DAY;
    case "weekly":
    default:        return since >= 6.5 * DAY;
  }
}

async function ownerEmail(svc: any, orgId: string): Promise<string | null> {
  try {
    const { data: mems } = await svc.from("memberships")
      .select("user_id, role").eq("org_id", orgId).in("role", ["owner", "admin"]).limit(3);
    for (const m of ((mems as any[]) || []).sort((a) => (a.role === "owner" ? -1 : 1))) {
      const { data } = await svc.auth.admin.getUserById(m.user_id);
      if (data?.user?.email) return data.user.email;
    }
  } catch { /* fall through */ }
  return null;
}

/** Business snapshot for one org, without going through the request-scoped helper. */
async function contextFor(svc: any, orgId: string): Promise<string | null> {
  const { data } = await svc.from("health_metrics")
    .select("label,value,unit,delta_pct,status").eq("org_id", orgId);
  const m = (data as any[]) || [];
  if (!m.length) return null;   // nothing real to report on — skip rather than invent
  let out = "KEY METRICS:\n" + m.map((x) =>
    `- ${x.label}: ${x.value}${x.unit === "INR" ? " INR" : " " + (x.unit || "")} (${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, ${x.status})`).join("\n");

  /*
    What Cortex collected, in the weekly brief.

    This is the Prove layer reaching the one artefact that arrives on its own.
    An owner who reads "we collected ₹2.4 lakh for you in the last 30 days"
    every Monday does not cancel — and unlike every other line in this email, it
    is a claim about the PRODUCT, so it has to be conservative: the SQL counts
    only invoices where a reminder was actually sent and the money then came in.
  */
  try {
    const { data: rec } = await svc.rpc("cortex_recovery_summary", { p_org: orgId, p_days: 30 });
    const r = (Array.isArray(rec) ? rec[0] : rec) as any;
    const amount = Number(r?.amount_recovered) || 0;
    const chasing = Number(r?.amount_chasing) || 0;
    if (amount > 0 || chasing > 0) {
      out += "\n\nCOLLECTIONS (last 30 days):";
      if (amount > 0) out += `\n- Recovered after a Cortex reminder: ${Math.round(amount)} INR across ${r.invoices_recovered} invoice(s)`;
      if (chasing > 0) out += `\n- Still chasing: ${Math.round(chasing)} INR across ${r.still_chasing} invoice(s)`;
    }
  } catch { /* collections not set up for this workspace */ }

  return out;
}

export type ReportRun = { checked: number; sent: number; skipped: number; errors: number };

export async function runScheduledReports(budget?: Budget): Promise<ReportRun> {
  const out: ReportRun = { checked: 0, sent: 0, skipped: 0, errors: 0 };
  const svc = serviceClient();
  if (!svc) return out;

  /*
    A FAILED FETCH USED TO BE INDISTINGUISHABLE FROM "NOBODY HAS REPORTS".

    This was `catch { return out; }` with the error never read. Since PostgREST
    returns `{ data: null, error }` rather than throwing, a rejected query left
    `rows = []`, the loop did nothing, and the cron recorded a perfectly normal
    `{ checked: 0, sent: 0, errors: 0 }`. Every subscriber's report silently
    stops arriving and the run that dropped them reports full health.

    Counting it as an error is what makes it visible: the cron's own status
    already fails on errors, so the outage surfaces instead of averaging away.
  */
  let rows: any[] = [];
  try {
    const { data, error } = await svc.from("scheduled_reports")
      .select("id, org_id, mode, cadence, send_to, last_sent").eq("is_active", true).limit(300);
    if (error) {
      console.error("[scheduled-reports] could not read the schedule —", error.message);
      out.errors++;
      return out;
    }
    rows = (data as any[]) || [];
  } catch (e: any) {
    console.error("[scheduled-reports] reading the schedule threw —", e?.message);
    out.errors++;
    return out;
  }

  for (const r of rows) {
    // A report is an AI call plus an email: up to ~8s. `last_sent` is the guard,
    // so anything skipped is still due tomorrow.
    if (budget && !budget.ok(9_000)) break;
    out.checked++;
    if (!isDue(r.cadence, r.last_sent)) { out.skipped++; continue; }

    /*
      THE MIS PACK, ON A SCHEDULE. Deterministic — no model, no credits — so it
      skips the AI path entirely and attaches the same workbook the Download
      button builds. Everything after the send (the last_sent guard) is shared.
    */
    let title = "", html = "";
    let attachments: Array<{ filename: string; content: Buffer }> | undefined;
    if (String(r.mode) === "mis_pack") {
      try {
        const { buildWorkbook } = await import("@/lib/engine/xlsx");
        const { data: org } = await svc.from("organizations").select("name").eq("id", r.org_id).maybeSingle();
        const biz = String((org as any)?.name || "Your business");
        const { buffer, filename } = await buildWorkbook("mis_pack", String(r.org_id), 365, biz);
        attachments = [{ filename, content: buffer }];
        title = `${biz} — your ${r.cadence} MIS pack`;
        html = `<div style="font-family:system-ui,sans-serif;max-width:620px;margin:auto">
      <h2 style="color:#2f6b54">${escapeHtml(title)}</h2>
      <p style="font-size:14px;line-height:1.65;color:#111">Attached: KPI overview, 24-month trend with margin formulas, receivables ageing, payables, top customers and collections — built from your own records just now. Nothing in it is modelled or projected.</p>
      <p style="font-size:12px;color:#888;margin-top:22px">Generated by MNB Cortex. Manage or stop this report under Reports.</p>
    </div>`;
      } catch (e: any) {
        console.error(`[scheduled-reports] MIS pack failed for ${r.org_id} —`, e?.message);
        out.errors++; continue;
      }
    } else {
    const context = await contextFor(svc, r.org_id);
    if (!context) { out.skipped++; continue; }   // empty workspace: nothing honest to send

    let body = "";
    /* Per-workspace AI key — see lib/ai/byo.ts. A scheduled report is exactly
       the case a BYO customer expects to run on their own provider. */
    /*
      Metered, like every other AI path — see the note in lib/credits.ts on
      chargeOrgForMode(). A scheduled report is an unattended model call on a
      timer, which makes it the easiest thing in the product to leave running
      for a workspace that stopped paying months ago.
    */
    const { chargeOrgForMode } = await import("@/lib/credits");
    const gate = await chargeOrgForMode(String(r.org_id), String(r.mode || "brief"));
    if (!gate.ok) { out.skipped++; continue; }
    /* "report" has no MODE_PROMPTS entry — generateFor() silently fell back to
       the three-sentence pulse, so a scheduled monthly review arrived as a
       pulse. It has its own generator, the one /api/report uses. */
    try { body = await withOrgAiKeys(r.org_id, () => String(r.mode) === "report" ? generateReport(context) : generateFor(String(r.mode || "brief"), "", context)); }
    catch { /* handled below */ }
    if (!body || /^I couldn't reach the AI engine/.test(body)) {
      /* Charged above, nothing produced: give the credits back. */
      const { refundIfCharged } = await import("@/lib/credits");
      await refundIfCharged(gate, String(r.mode || "brief")).catch(() => {});
      out.errors++; continue;
    }

    title = `Your ${r.cadence} ${r.mode} — MNB Cortex`;
    html = `<div style="font-family:system-ui,sans-serif;max-width:620px;margin:auto">
      <h2 style="color:#2f6b54">${title}</h2>
      <div style="font-size:14px;line-height:1.65;color:#111">${mdToHtml(body)}</div>
      <p style="font-size:12px;color:#888;margin-top:22px">Generated by MNB Cortex. Manage or stop this report under Reports.</p>
    </div>`;

    }

    const to = r.send_to || (await ownerEmail(svc, r.org_id));
    if (!to) { out.errors++; continue; }
    const res = await sendEmail(to, title, html, { from: brandFrom(), kind: `scheduled_${r.mode}`, orgId: r.org_id, attachments });
    if (res.sent) {
      out.sent++;
      /*
        ======================================================================
        `last_sent` IS THE ONLY IDEMPOTENCY GUARD, AND IT WAS WRITTEN INTO A
        `catch {}` THAT COULD NOT CATCH
        ======================================================================

        The line above this one used to say so itself — "last_sent is the
        idempotency guard — only advance it on a real send" — and then advanced
        it with `try { ...update... } catch {}`. PostgREST reports a failed
        update by returning `{ error }`; it does not throw. A zero-row update
        does not even return an error. So the guard's write had no handling of
        any kind for either way it can fail.

        What a stale `last_sent` costs, via isDue() above:

          !lastSent            → due
          weekly               → due once `since >= 6.5 days`
          monthly              → due once `since >= 28 days`

        The cron runs daily (`30 4 * * *`). So a WEEKLY report whose guard fails
        to advance is due again tomorrow morning, and the morning after, and
        every morning until someone intervenes. Each run:

          · charges the workspace's AI credits (chargeOrgForMode, above)
          · generates the report
          · emails it to the customer

        The customer gets their "weekly" summary daily and pays for each one. A
        brand-new weekly report whose very first guard write fails has
        `last_sent = null`, which isDue() treats as due — so it loops from the
        first day. A daily report is unaffected, which is exactly why this could
        sit here unnoticed: the common case looks right.

        One retry, then an alert. The guard lives in the database, so if the
        database will not take it there is nothing in this process that can
        stop the loop — but an operator can, and they cannot act on a failure
        nobody records. It is also counted as an error rather than a clean
        send, because a send we cannot remember making is not a success.
      */
      let guarded = false;
      for (let attempt = 0; attempt < 2 && !guarded; attempt++) {
        try {
          const { data: marked, error } = await svc.from("scheduled_reports")
            .update({ last_sent: new Date().toISOString() })
            .eq("id", r.id)
            .select("id");
          guarded = !error && (marked?.length ?? 0) > 0;
          if (!guarded) {
            console.error(
              `[scheduled-reports] attempt ${attempt + 1}: could not advance last_sent for ${r.id} —`,
              error ? error.message : `matched ${marked?.length ?? 0} rows`);
          }
        } catch (e: any) {
          console.error(`[scheduled-reports] attempt ${attempt + 1} threw for ${r.id} —`, e?.message);
        }
      }

      if (!guarded) {
        out.errors++;
        try {
          const { operatorAlert } = await import("@/lib/operator-alert");
          await operatorAlert({
            kind: "report_guard_unwritten",
            severity: r.cadence === "daily" ? "amber" : "red",
            orgId: String(r.org_id),
            title: `Scheduled report ${r.id} sent but not marked (${r.cadence})`,
            body:
              `A ${r.cadence} ${r.mode} report was emailed to ${to} and ` +
              `scheduled_reports.last_sent could not be advanced.\n\n` +
              (r.cadence === "daily"
                ? `Cadence is daily, so the next run is due anyway — no duplicate ` +
                  `will be sent. Still worth finding out why the write failed.`
                : `THE CRON RUNS DAILY AND last_sent IS THE ONLY GUARD, so this ` +
                  `report will be regenerated, recharged and resent EVERY MORNING ` +
                  `until last_sent is set or is_active is turned off. Set ` +
                  `last_sent on row ${r.id} now.`),
          });
        } catch (e: any) {
          console.error(`[scheduled-reports] guard alert failed for ${r.id} —`, e?.message);
        }
      }

      await emitQuietly(r.org_id, "report.generated", { mode: r.mode, cadence: r.cadence, to });
    } else {
      out.errors++;
    }
  }

  return out;
}
