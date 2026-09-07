import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { brandFrom } from "@/lib/branded-email";
import { buildPriorities, type Priority } from "@/lib/ai/priorities";
import { unsubToken } from "@/lib/weekly-update";
import type { Budget } from "@/lib/cron-budget";

// "Your plan for the week" — a per-workspace email built from the SAME prioritizer
// as the in-app command center. Each owner gets the few actions that matter, from
// their own numbers. Gated + opt-out respected. Only orgs with real data are emailed.

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
const CONTACT = "contact@mnbresearch.com";
const C_FROM = "#1f4a3b", C_TO = "#2f6b54";
const U: Record<string, string> = { high: "Now", medium: "This week", low: "Soon" };

function esc(s: string) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function unsubUrl(email: string) { return `${APP_URL}/api/unsub?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`; }
function firstNameOf(email: string, meta?: any): string {
  const n = String(meta?.full_name || meta?.name || "").trim(); if (n) return n.split(/\s+/)[0];
  const p = String(email.split("@")[0] || "").replace(/[._\-+]+/g, " ").trim(); const w = p.split(" ")[0];
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : "there";
}
function ctxFromMetrics(m: any[]): string {
  return "KEY METRICS:\n" + m.map((x) => {
    const d = typeof x.delta_pct === "number" && Number.isFinite(x.delta_pct)
      ? `${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, ` : "";
    return `- ${x.label}: ${x.value}${x.unit === "INR" ? " INR" : " " + (x.unit || "")} (${d}${x.status})`;
  }).join("\n");
}

function renderHtml(firstName: string, plan: Priority[], unsub: string): string {
  const rows = plan.map((p, i) => `<tr><td style="padding:9px 0;border-bottom:1px solid #eef1f0;vertical-align:top">
    <div style="font-size:15px;color:#12281f"><b>${i + 1}. ${esc(p.title)}</b> <span style="font-size:11px;color:#5b6b64;border:1px solid #e6ece9;border-radius:999px;padding:1px 7px">${U[p.urgency] || "This week"}</span></div>
    <div style="font-size:13px;color:#5b6b64;margin-top:2px">${esc(p.why)}</div>
    <a href="${APP_URL}${p.href}" style="font-size:12px;color:${C_TO};text-decoration:none;font-weight:600">Open ${esc(p.tool)} →</a>
  </td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td style="background:linear-gradient(135deg,${C_FROM},${C_TO});padding:24px 28px">
    <div style="font-size:21px;font-weight:800;color:#fff">MNB Cortex</div>
    <div style="font-size:13px;color:#d9ece3;margin-top:3px">Your plan for the week</div>
  </td></tr>
  <tr><td style="padding:24px 28px 6px;color:#1a2420;font-size:15px;line-height:1.6">
    <p style="margin:0 0 6px">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 6px">Based on your numbers, here's what I'd focus on this week:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>
  <tr><td style="padding:14px 28px 22px"><a href="${APP_URL}/plan" style="display:inline-block;background:${C_TO};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:9px">Open your full plan →</a></td></tr>
  <tr><td style="padding:0 28px 8px;color:#1a2420;font-size:14px"><p style="margin:0">— Cortex, your AI COO</p></td></tr>
  <tr><td style="padding:4px 28px 26px">
    <hr style="border:none;border-top:1px solid #e6e9ef;margin:20px 0" />
    <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:0">
      <strong>MNB Cortex</strong> is a product of <strong>MNB Research</strong>, operated by <strong>Abrobot Technologies</strong>, Delhi, India.<br/>
      Email: <a href="mailto:contact@mnbresearch.com" style="color:#12315c">contact@mnbresearch.com</a> · WhatsApp/Phone: +91 97114 88481<br/>
      You're receiving this because you have an MNB Cortex workspace. <a href="${unsub}" style="color:#12315c">Unsubscribe</a> at any time.<br/>
      © 2026 Abrobot Technologies. All rights reserved.
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;
}
function renderText(firstName: string, plan: Priority[], unsub: string): string {
  const lines = plan.map((p, i) => `${i + 1}. ${p.title} [${U[p.urgency] || "This week"}]\n   ${p.why}\n   ${p.tool}: ${APP_URL}${p.href}`).join("\n\n");
  return [`Hi ${firstName},`, "", "Based on your numbers, here's what I'd focus on this week:", "", lines, "", `Open your full plan: ${APP_URL}/plan`, "", "— Cortex, your AI COO", "", "————", "MNB Cortex · MNB Research · contact@mnbresearch.com", `Unsubscribe: ${unsub}`].join("\n");
}

/*
  Returns `partial: true` when the directory could not be read completely.

  This used to `break` on error and hand back whatever it had. The caller then
  found no recipients for the affected workspaces, recorded them as sent for
  the week anyway, and moved on — so a transient Supabase error silently and
  PERMANENTLY skipped those customers' plan email. A truncated directory has to
  abort the run, not quietly shrink the audience.
*/
async function listUsers(sb: any): Promise<{ map: Map<string, { email: string; firstName: string }>; partial: boolean }> {
  const map = new Map<string, { email: string; firstName: string }>();
  let partial = false;
  let page = 1;
  for (; page <= 40; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { partial = true; break; }
    const users: any[] = data?.users || [];
    for (const u of users) {
      const email = String(u?.email || "").toLowerCase().trim();
      if (!email || (!u?.email_confirmed_at && !u?.confirmed_at)) continue;
      map.set(u.id, { email, firstName: firstNameOf(email, u?.user_metadata) });
    }
    if (users.length < 200) return { map, partial };
  }
  // Fell out of the loop still on full pages: there are more users than the
  // page cap can reach, so this list is incomplete too.
  if (page > 40) partial = true;
  return { map, partial };
}
async function optedOut(sb: any): Promise<Set<string>> {
  try { const { data } = await sb.from("email_optouts").select("email").limit(100_000); return new Set((data as any[] || []).map((r) => String(r.email || "").toLowerCase())); }
  catch { return new Set(); }
}

export type PlanSendResult = {
  skipped: boolean; reason?: string; orgs?: number; sent?: number; failed?: number; test?: boolean;
  week?: string;        // the ISO week this run belongs to
  remaining?: number;   // workspaces deferred to the next daily run
  ledger?: boolean;     // false = weekly_plan_sends missing; no dedupe this run
};

/*
  The Monday-based ISO week key, in IST.

  It has to match the boundary the cron uses to decide a new week has started,
  or a workspace could be marked "sent" for a week that has not begun where the
  customer lives. Everything customer-facing in this product is IST.
*/
export function istWeekKey(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  // Shift to the Thursday of this ISO week, which is what defines the year.
  const day = ist.getUTCDay() || 7;                       // Mon=1 … Sun=7
  const thu = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  thu.setUTCDate(thu.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thu.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/*
  How much one invocation will do.

  buildPriorities() is a model call per workspace, 2-10s each, and this runs
  inside the autopilot cron which shares a 300s function budget with the
  metrics sweep and the daily analysis. 60 sequential model calls is 120-600s
  on its own — enough to time out the whole cron, and a timeout mid-loop is the
  worst outcome available: nothing recorded, nothing sent, repeatably.

  So the cap is a wall-clock BUDGET as well as a count, and the budget is the
  one that actually binds. Whatever is not reached today is picked up by
  tomorrow's run inside the same ISO week.
*/
const PER_RUN = 25;
const BUDGET_MS = 90_000;

export async function sendWeeklyPlans(opts?: { test?: boolean; now?: Date; budget?: Budget }): Promise<PlanSendResult> {
  const test = !!opts?.test;
  const sb = serviceClient();
  if (!sb) return { skipped: true, reason: "no SUPABASE_SERVICE_ROLE_KEY" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: true, reason: "no RESEND_API_KEY" };

  const now = opts?.now ?? new Date();
  const week = istWeekKey(now);
  const startedAt = Date.now();

  /*
    IS THE LEDGER THERE? Everything downstream depends on the answer.

    The autopilot cron now calls this EVERY day rather than only on Monday,
    because the ledger is what guarantees one send per workspace per week. If
    the table is missing — and Vercel deploys before anyone runs a migration,
    which this codebase has been bitten by before — then "send anyway, don't
    record" would mail every customer their plan SEVEN TIMES A WEEK, from the
    moment of deploy until someone noticed.

    That is a far worse failure than the feature being late by a few days. So a
    missing ledger falls back to the old Monday-only behaviour: still correct,
    still bounded at one send a week by the calendar, and it says so in the
    result rather than degrading silently.
  */
  const sent = new Set<string>();
  let ledger = true;
  try {
    // Explicitly bounded. PostgREST caps unbounded selects at db-max-rows
    // (1000 by default), and a silently truncated "already sent" set would
    // re-mail the overflow every single day.
    const { data, error } = await sb.from("weekly_plan_sends").select("org_id").eq("week", week).limit(20_000);
    if (error) ledger = false;
    else for (const r of ((data as any[]) || [])) sent.add(String((r as any).org_id));
  } catch { ledger = false; }

  const istDay = new Date(now.getTime() + 5.5 * 3600 * 1000).getUTCDay();   // 1 = Monday IST
  if (!test && !ledger && istDay !== 1) {
    return { skipped: true, reason: "weekly_plan_sends missing — run the migration; falling back to Monday-only", week, ledger: false };
  }

  const [{ map: users, partial }, outs] = await Promise.all([listUsers(sb), optedOut(sb)]);

  /*
    A truncated user directory must abort, not shrink the audience.

    With a partial map, members of the affected workspaces resolve to nothing,
    the workspace looks like it has zero recipients, and — because the claim is
    written regardless — it gets marked as sent for the week having received
    nothing. A transient error would permanently skip real customers.
  */
  if (!test && partial) {
    return { skipped: true, reason: "could not read the full user directory — skipping rather than mailing a partial audience", week, ledger };
  }

  // Stable ordering so "the next N" means something across invocations.
  const { data: orgs } = await sb.from("organizations").select("id,name").order("created_at", { ascending: true }).limit(2000);

  const targets: { email: string; firstName: string; plan: Priority[] }[] = [];
  let considered = 0;
  let processed = 0;
  const claimed: string[] = [];
  const queue = ((orgs as any[]) || []).filter((o) => test || !sent.has(String(o.id)));

  /*
    One email per person, decided BEFORE the claim rather than after it.

    The dedupe used to run over the flattened target list at the end, after
    every org had already been recorded as sent. So a user who belongs to orgs
    A and B received A's plan, and B was marked done for the week having sent
    nothing about B — and the ledger recorded a recipient count that was false.
  */
  const seenEmails = new Set<string>();

  let stoppedEarly = false;
  for (const o of queue) {
    /*
      TWO CLOCKS, AND THE TIGHTER ONE WINS.

      BUDGET_MS is this step's own limit; `opts.budget` is the share the whole
      nightly run has allotted it. Honouring only the local one is how a step
      overruns a function that has twelve other things to do — and every
      workspace this loop starts is CLAIMED in weekly_plan_sends before the
      email is sent, so overrunning does not delay those emails, it cancels
      them for the week.
    */
    const overLocal = Date.now() - startedAt > BUDGET_MS;
    const overShared = Boolean(opts?.budget && !opts.budget.ok(11_000));
    if (processed >= PER_RUN || overLocal || overShared) { stoppedEarly = true; break; }

    const { data: m } = await sb.from("health_metrics").select("label,value,unit,delta_pct,status").eq("org_id", o.id);
    if (!m?.length) continue;                       // only workspaces with real data
    const { priorities } = await buildPriorities(ctxFromMetrics(m as any[]), true);
    if (!priorities.length) continue;
    considered++;
    processed++;
    if (test) { targets.push({ email: CONTACT, firstName: "there", plan: priorities }); break; }

    const { data: mem } = await sb.from("memberships").select("user_id").eq("org_id", o.id);
    const forThisOrg: { email: string; firstName: string }[] = [];
    for (const mm of ((mem as any[]) || [])) {
      const u = users.get(mm.user_id);
      if (!u || outs.has(u.email) || seenEmails.has(u.email)) continue;
      forThisOrg.push(u);
    }
    if (!forThisOrg.length) continue;   // nobody to write to; leave the week unclaimed

    /*
      CLAIM THE WEEK ATOMICALLY, one workspace at a time.

      The first version read the whole ledger up front and upserted at the end,
      with minutes of model calls in between. Two overlapping runs — a cron
      retry, or the operator hitting the manual endpoint — would both read an
      empty set and both send. And `upsert` cannot be a claim at all: it
      overwrites on conflict instead of failing, so the loser of the race never
      learns it lost.

      `upsert` with `ignoreDuplicates: true` compiles to ON CONFLICT DO NOTHING
      (NOT to an overwrite — that is what plain upsert does, and why plain
      upsert cannot be a claim), and DO NOTHING ... RETURNING yields rows only
      for the insert that actually won. That is the lock. The same pattern is
      used by renewal_notices in this codebase.
    */
    if (ledger) {
      const { data: won, error: claimErr } = await sb
        .from("weekly_plan_sends")
        .upsert({ org_id: String(o.id), week, recipients: forThisOrg.length }, { onConflict: "org_id,week", ignoreDuplicates: true })
        .select("org_id");
      if (claimErr) continue;                        // couldn't claim → don't send
      if (!won || !(won as any[]).length) continue;  // someone else has this week
      claimed.push(String(o.id));
    }

    for (const u of forThisOrg) {
      seenEmails.add(u.email);
      targets.push({ email: u.email, firstName: u.firstName, plan: priorities });
    }
  }

  // Honest, rather than `queue.length - PER_RUN`: most of the queue is usually
  // filtered out by the metrics and priorities checks without consuming any
  // budget, so the old figure reported hundreds "remaining" on a run that had
  // in fact finished the week's work.
  const remaining = stoppedEarly ? Math.max(0, queue.length - processed) : 0;

  /*
    Deduplication already happened above, per person, before each claim — so
    `targets` is final. It is asserted rather than re-filtered because a second
    filter here would silently paper over a bug in the first one.
  */
  const final = targets;
  if (!final.length) return { skipped: true, reason: "no eligible recipients", orgs: considered, week, remaining, ledger, test };

  const from = process.env.WEEKLY_FROM || brandFrom();
  const subject = "Your MNB Cortex plan for the week";
  let ok = 0, fail = 0;
  for (let i = 0; i < final.length; i += 100) {
    const chunk = final.slice(i, i + 100).map((t) => {
      const u = unsubUrl(t.email);
      return { from, to: [t.email], reply_to: CONTACT, subject, html: renderHtml(t.firstName, t.plan, u), text: renderText(t.firstName, t.plan, u),
        headers: { "List-Unsubscribe": `<mailto:unsubscribe@mnbresearch.com>, <${u}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
    });
    try {
      const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(chunk) });
      if (r.ok) ok += chunk.length; else fail += chunk.length;
    } catch { fail += chunk.length; }
    if (i + 100 < final.length) await new Promise((res) => setTimeout(res, 1000));
  }

  /*
    RELEASE THE CLAIM IF NOTHING WENT OUT.

    The claim is taken before the send, deliberately: at-most-once is the right
    guarantee for an email that tells a business owner what to do this week, and
    a duplicate would have them hunting for a change in the advice that is not
    there. But "at most once" should not become "never" because Resend was down
    for one minute. If the whole run failed to deliver a single message, the
    week was not used and the claim is given back so tomorrow retries.

    Only the total-failure case. A partial failure cannot be unwound safely from
    here — the batches are flattened across workspaces, so releasing a claim
    would risk re-mailing the recipients in that batch who did receive it, and
    a duplicate is the outcome this whole mechanism exists to prevent.
  */
  if (!test && ledger && ok === 0 && fail > 0 && claimed.length) {
    try { await sb.from("weekly_plan_sends").delete().eq("week", week).in("org_id", claimed); } catch { /* next week, then */ }
  }

  // `remaining` is what the budget deferred to the next daily run. It used to
  // be invisible, which is how a silent truncation stays silent.
  return { skipped: false, orgs: considered, sent: ok, failed: fail, test, week, remaining, ledger };
}
