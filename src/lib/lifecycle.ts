import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { renderBrandedEmail, brandFrom, brandReplyTo } from "@/lib/branded-email";
import type { Budget } from "@/lib/cron-budget";

/*
  THE FOUR EMAILS NOBODY WHO SIGNED UP HAS EVER RECEIVED.

  Every outbound email in this product goes to an existing paying customer.
  There is no welcome, no "you never imported anything", no re-engagement —
  ensureWorkspace() contains no sendEmail call at all. Combined with
  TRIAL_DAYS = 0, that means every person who signs up, meets the paywall and
  closes the tab is never heard from again.

  Meanwhile first-run.ts already computes exactly which of the four setup steps
  each workspace is stuck on. That state is rendered in the app and emailed to
  nobody. This connects the two.

  WHAT MAKES THIS NOT SPAM — the four rules it is built on

  1. IT STOPS WHEN THEY ACT. Every stage is gated on the workspace still being
     stuck. Import your invoices and the import nudge never sends, even though
     it is "due" today. A sequence that keeps going after the thing it is
     asking for has been done is the definition of the genre nobody wants.

  2. FOUR IN TWO WEEKS, THEN SILENCE. Not a drip that runs for a quarter. If
     someone has not come back after day 14 they have decided, and continuing
     to write is our problem, not theirs.

  3. EVERY ONE SAYS SOMETHING TRUE AND SPECIFIC. Not "did you know Cortex has
     29 calculators". The nudges name the step they are stuck on and what it
     would get them. If we have nothing useful to say at a stage, the right
     number of emails for that stage is zero.

  4. UNSUBSCRIBE IS HONOURED FROM THE FIRST ONE. Same email_optouts table the
     weekly update uses. Someone who has opted out of one thing from us has
     opted out of this.

  EXACTLY ONCE. `lifecycle_sends` has (org_id, stage) as its primary key, and
  the claim is an insert-on-conflict-do-nothing before the send — the same
  pattern as renewal_notices, for the same reason: the cron can run twice, and
  two welcome emails is worse than none.
*/

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
const DAY = 86_400_000;

export type Stage = "welcome" | "setup_nudge" | "import_nudge" | "last_call";

/*
  THE SCHEDULE, AND WHY EACH DAY.

  welcome      day 0  — sent on the first nightly run after signup. Not
                        instant: an instant welcome competes with the magic
                        link they are already reading, and lands while they
                        are still in the product.
  setup_nudge  day 2  — they signed up and did not finish telling us who they
                        are. Two days is long enough to be a real drop-off and
                        short enough that they remember signing up.
  import_nudge day 5  — the one that matters. They have a workspace and no
                        data, so the product has never done anything for them.
  last_call    day 14 — the final one. Says so, explicitly, and offers the free
                        ledger check as a way to get value without paying.
*/
const SCHEDULE: { stage: Stage; day: number }[] = [
  { stage: "welcome", day: 0 },
  { stage: "setup_nudge", day: 2 },
  { stage: "import_nudge", day: 5 },
  { stage: "last_call", day: 14 },
];

type Ctx = {
  firstName: string;
  orgName: string;
  hasCompany: boolean;
  hasData: boolean;
};

function render(stage: Stage, c: Ctx): { subject: string; body: string } | null {
  const hi = `Hi ${c.firstName},`;

  if (stage === "welcome") {
    return {
      subject: "Your Cortex workspace is ready — here is the shortest path to something useful",
      body: `${hi}

Your workspace is set up. Rather than a tour, here is the one thing worth doing first.

Export your receivables from Tally, Busy, Vyapar, Zoho or Excel and import them:

  ${APP_URL}/import

That is the whole setup. From then on Cortex reads them every night and emails you
when something crosses a line — who has not paid, what is due, and what is sitting
past 45 days for section 43B(h).

Two things worth knowing up front, because they are the questions people ask:

  There is no free trial. A plan starts at ₹799/month, or you can buy ₹149 of
  credits and use them with no subscription at all. Importing your data and
  looking at your own receivables costs nothing either way.

  Your data stays yours. It is isolated per workspace, and you can export or
  delete all of it at any time from Settings.

If your export does not import cleanly, reply to this email and send me the header
row — that is usually a five-minute fix on our side, and I would rather know.

— Team MNB Cortex`,
    };
  }

  if (stage === "setup_nudge") {
    /* Only sent when the company step is still undone — see the gate below. */
    return {
      subject: "Cortex does not know what your business does yet",
      body: `${hi}

You created a workspace a couple of days ago but have not told Cortex what
${c.orgName === "your business" ? "your business" : c.orgName} actually does.

That sounds like a formality and is not. Your industry decides which warnings
matter: a 90-day receivable is ordinary in construction and an emergency in
retail, and Cortex uses that to decide what is worth emailing you about. Without
it every threshold is a guess.

It takes about thirty seconds:

  ${APP_URL}/onboarding

— Team MNB Cortex`,
    };
  }

  if (stage === "import_nudge") {
    return {
      subject: "Cortex has nothing to watch yet",
      body: `${hi}

Your workspace has been open for a few days with no data in it, which means
Cortex has never actually done anything for you. That is worth fixing or
abandoning — either is better than it sitting there.

The import takes one file. Receivables are the place to start:

  ${APP_URL}/import

If you would rather see what it produces before committing, you can run the same
analysis with no import and no account at all — paste your receivables here and
you will get your overdue total, your oldest unpaid invoice, and who is holding
the concentration:

  ${APP_URL}/health-check

If something about the import is not working, reply and tell me what happened.
A file that will not import is our bug more often than it is your file.

— Team MNB Cortex`,
    };
  }

  if (stage === "last_call") {
    return {
      subject: "Last email from us about your Cortex workspace",
      body: `${hi}

This is the last one — you signed up two weeks ago and have not set the workspace
up, so I will stop writing.

Your workspace stays where it is; nothing is deleted and you can pick it up
whenever you like.

If it is useful, the free receivables check needs no account and no card, and
gives you a real read of your overdue money in about a minute:

  ${APP_URL}/health-check

And if Cortex was not the right thing, I would genuinely like to know why —
just reply to this email. One line is plenty, and it is more useful to us than
you would think.

— Team MNB Cortex`,
    };
  }

  return null;
}

export type LifecycleResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  stoppedEarly?: boolean;
};

/**
 * Send whichever lifecycle email is due, to workspaces that are still stuck.
 *
 * Deliberately mirrors sendRenewalReminders: claim, send, release on failure.
 */
export async function sendLifecycleEmails(budget?: Budget): Promise<LifecycleResult> {
  const out: LifecycleResult = { checked: 0, sent: 0, skipped: 0, errors: 0 };
  const svc = serviceClient();
  if (!svc) return out;

  const now = Date.now();

  /*
    Only workspaces created in the last 20 days. Past the final stage there is
    nothing to send, and scanning every organisation for ever is how a nightly
    job that costs nothing today costs minutes a year from now.
  */
  let orgs: any[] = [];
  try {
    const { data } = await svc
      .from("organizations")
      .select("id, name, industry, created_at, subscription_status, credits")
      .gte("created_at", new Date(now - 20 * DAY).toISOString())
      .limit(500);
    orgs = (data as any[]) || [];
  } catch { return out; }
  if (!orgs.length) return out;

  /* Everything already sent to this cohort, in one query rather than per org. */
  const sentByOrg = new Map<string, Set<string>>();
  try {
    const { data } = await svc
      .from("lifecycle_sends")
      .select("org_id, stage")
      .in("org_id", orgs.map((o) => o.id));
    for (const r of (data as any[]) || []) {
      if (!sentByOrg.has(r.org_id)) sentByOrg.set(r.org_id, new Set());
      sentByOrg.get(r.org_id)!.add(r.stage);
    }
  } catch {
    /* Table not migrated yet. Sending without the ledger would mean sending the
       same email every night, which is far worse than sending none. */
    return out;
  }

  for (const o of orgs) {
    if (budget && !budget.ok(2_000)) { out.stoppedEarly = true; break; }
    out.checked++;

    const created = new Date(o.created_at).getTime();
    if (!Number.isFinite(created)) { out.skipped++; continue; }
    const age = Math.floor((now - created) / DAY);

    /*
      A PAYING CUSTOMER IS NOT IN THIS SEQUENCE.

      They get the weekly plan and the renewal notices instead. Nudging someone
      who has already paid to "choose a plan" is the single most irritating
      thing an onboarding sequence can do, and the easiest to get wrong.
    */
    const paid = String(o.subscription_status || "") === "active" || Number(o.credits || 0) > 0;
    if (paid && age > 0) { out.skipped++; continue; }

    /* The latest stage whose day has arrived and which has not been sent. */
    const already = sentByOrg.get(o.id) || new Set<string>();
    const due = SCHEDULE.filter((s) => age >= s.day && !already.has(s.stage)).pop();
    if (!due) { out.skipped++; continue; }

    /*
      STILL STUCK? Re-checked at send time, not assumed from the schedule.

      A workspace that finished setting up on day 3 must not receive the day-5
      import nudge. Cheap enough to check per org, and it is the difference
      between a helpful nudge and a sequence that ignores what you did.
    */
    const rawName = String(o.name || "").trim();
    const placeholder = !rawName || /^(my workspace|my company|untitled)$/i.test(rawName);
    const hasCompany = !placeholder && Boolean(o.industry);

    let hasData = false;
    try {
      const { count } = await svc.from("invoices").select("id", { count: "exact", head: true }).eq("org_id", o.id).limit(1);
      hasData = (count || 0) > 0;
    } catch { /* treat as no data; the nudge is still honest */ }

    if (due.stage === "setup_nudge" && hasCompany) { out.skipped++; continue; }
    if (due.stage === "import_nudge" && hasData) { out.skipped++; continue; }
    if (due.stage === "last_call" && (hasData || paid)) { out.skipped++; continue; }

    /* Who to write to, and whether they have opted out. */
    let to = "";
    try {
      const { data: mem } = await svc.from("memberships").select("user_id").eq("org_id", o.id).eq("role", "owner").limit(1);
      const uid = (mem as any[])?.[0]?.user_id;
      if (!uid) { out.skipped++; continue; }
      const { data: u } = await (svc as any).auth.admin.getUserById(uid);
      to = String(u?.user?.email || "").trim();
      if (!to || !u?.user?.email_confirmed_at) { out.skipped++; continue; }
    } catch { out.errors++; continue; }

    try {
      const { data: opt } = await svc.from("email_optouts").select("email").eq("email", to.toLowerCase()).limit(1);
      if ((opt as any[])?.length) { out.skipped++; continue; }
    } catch { /* table absent — proceed */ }

    const content = render(due.stage, {
      firstName: to.split("@")[0].replace(/[._-]+/g, " ").split(" ")[0] || "there",
      orgName: placeholder ? "your business" : rawName,
      hasCompany,
      hasData,
    });
    if (!content) { out.skipped++; continue; }

    /*
      CLAIM FIRST. The primary key is the lock: a second cron run, or an
      overlapping one, gets zero rows back and sends nothing.
    */
    const { error: claimErr } = await svc
      .from("lifecycle_sends")
      .insert({ org_id: o.id, stage: due.stage, sent_to: to });
    if (claimErr) { out.skipped++; continue; }   // already claimed

    const html = renderBrandedEmail(content.body, { origin: APP_URL, preheader: content.subject });
    const res = await sendEmail(to, content.subject, html, { from: brandFrom(), replyTo: brandReplyTo() });

    if (res.sent) {
      out.sent++;
    } else {
      out.errors++;
      /*
        Release the claim so tomorrow retries rather than skipping forever —
        the same rule as renewal-email.ts. A welcome email lost to a Resend
        outage should not mean the customer never gets one.
      */
      try {
        await svc.from("lifecycle_sends").delete().eq("org_id", o.id).eq("stage", due.stage);
      } catch { /* it will not retry; nothing better to do */ }
    }
  }

  return out;
}
