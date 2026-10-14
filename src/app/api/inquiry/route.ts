import { NextResponse } from "next/server";
import { recordQuietly } from "@/lib/funnel";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/operators";
import { renderBrandedEmail, brandFrom, brandReplyTo, plainCallerText } from "@/lib/branded-email";
import { ALL_PLANS } from "@/lib/config";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { clientIp, contactFormLimits, enforce } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cap = (v: any, n: number) => String(v ?? "").slice(0, n);

/*
  ALLOW-LISTED, NOT ECHOED. plan, currency and source arrive from the browser,
  and plan and currency used to go verbatim into the email we send to whatever
  address was typed — uncapped. That made this unauthenticated route a relay
  for arbitrary text (and links) from our verified domain. Only values our own
  pages send are accepted; anything else becomes the neutral default.
*/
const PLAN_NAMES = new Set<string>([...ALL_PLANS.map((p) => p.name), "Health Check"]);
const CURRENCIES = new Set(["INR", "USD"]);
const SOURCES = new Set(["pricing", "health-check"]);
/** Hosts our own copy links to; nothing else in a caller-bound mail is a link. */
const LINK_HOSTS = ["mnbresearch.com", "wa.me"];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const name = cap(body.name, 120).trim();
    const email = cap(body.email, 200).trim();
    const phone = cap(body.phone, 30).trim();
    const plan = PLAN_NAMES.has(String(body.plan ?? "")) ? String(body.plan) : "";
    const cycle = body.cycle;
    const note = cap(body.note, 2000);
    const company = cap(body.company, 160).trim();
    /*
      The score arrives as a number from the health check and is absent for
      every other caller. Clamped rather than trusted: it is submitted from the
      browser, and it drives the operator's "call the worst first" ordering.
    */
    const rawScore = Number(body.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
    /* Echoed into the caller's report, so stripped of URLs/domains and capped. */
    const weak: string[] = Array.isArray(body.weak) ? body.weak.map((w: any) => plainCallerText(w, 60)).filter(Boolean).slice(0, 8) : [];
    if (!name || !email) return NextResponse.json({ ok: false, error: "Name and email are required." }, { status: 200 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 200 });

    // Unauthenticated and it sends mail from our verified domain — throttle it,
    // or it's a free spam relay against our sender reputation.
    const exceeded = await enforce(contactFormLimits(email, clientIp(req)));
    if (exceeded) {
      return NextResponse.json({
        ok: false, rateLimited: true,
        error: "We've already received your request. Our team will be in touch shortly — or message us on WhatsApp for a faster reply.",
      }, { status: 429 });
    }

    const src = SOURCES.has(String(body.source ?? "")) ? String(body.source) : "pricing";

    // Where the operator gets notified (defaults to ADMIN_EMAIL; override with LEAD_NOTIFY_EMAIL).
    const notifyTo = process.env.LEAD_NOTIFY_EMAIL || ADMIN_EMAIL;
    const origin = (() => { try { return new URL(req.url).origin; } catch { return "https://cortex.mnbresearch.com"; } })();
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const curIn = String(body.currency ?? "INR").toUpperCase();
    const cur = CURRENCIES.has(curIn) ? curIn : "INR";
    const cyc = cycle === "annual" ? "Annual" : "Monthly";

    // Persist the lead first (best-effort) so nothing is lost even if email fails.
    /*
      WHETHER IT LANDED IS NOW RECORDED. The block below already retried on a
      column mismatch, but both outcomes were discarded, so "best-effort" meant
      nobody — not the operator, not the visitor, not a log — could tell a
      stored lead from a lost one. `stored` is used at the end of the handler to
      decide what to tell the person who filled the form.
    */
    let stored = false;
    if (hasSupabase()) {
      try {
        /*
          company, note and score were being SENT and dropped — the table did
          not have the columns (see 2026_zzza_lead_detail.sql). So the score,
          the band and the named weak areas survived only in the prose of the
          operator's notification email, where nothing can query them. A
          follow-up call six weeks later could not open on the prospect's
          actual problem because nothing remembered what it was.
        */
        const row: Record<string, any> = {
          name, email, phone: phone || null,
          plan: `${plan || "Cortex"} · ${cur} · ${cyc}`,
          source: src,
          company: company || null,
          note: note || null,
          score,
        };
        const { error } = await (await createClient()).from("leads").insert(row);
        if (!error) {
          stored = true;
        } else {
          /*
            Deploy-before-migrate: this ships before anyone runs the migration.
            Retry with the original four columns rather than losing the lead
            entirely — a lead with less detail beats no lead at all.
          */
          const { company: _c, note: _n, score: _s, ...core } = row;
          const { error: e2 } = await (await createClient()).from("leads").insert(core);
          stored = !e2;
          if (e2) console.error("[inquiry] lead not stored —", e2.message, "(first attempt:", error.message, ")");
        }
      } catch (e: any) {
        console.error("[inquiry] lead insert threw —", e?.message);
      }
    }

    const adminBody = `A new prospect requested pricing / access on the MNB Cortex site.

Source: ${src}
Plan requested: ${plan || "—"}
Currency: ${cur}   Billing: ${cyc}
Name: ${name}
Email: ${email}
Phone: ${phone || "—"}${note ? `\nNotes: ${note}` : ""}
Received: ${when} IST

WHAT TO DO NEXT
1. Open your Leads inbox: ${origin}/leads
2. Once they sign up (or you invite them), open Super Admin: ${origin}/superadmin
3. Find their workspace and set the plan + grant credits from the customer manager.

Reply to this email to reach ${name.split(" ")[0] || "them"} directly.`;
    /* Operator mail too: the prospect's typed note/name never become links. */
    const ownHosts = [...LINK_HOSTS, (() => { try { return new URL(origin).hostname; } catch { return "mnbresearch.com"; } })()];
    const adminHtml = renderBrandedEmail(adminBody, { preheader: `${plan || "Cortex"} request from ${name} (${cur})`, linkHosts: ownHosts });

    /*
      SEND THE REPORT WE PROMISED.

      The health check tells the visitor twice that a full breakdown is on its
      way — "We'll email the full breakdown", then "Your report is on its way".
      What actually arrived was "our team will reach out shortly": a generic
      acknowledgement, from a form that had just computed a score out of 100
      and named their three weakest areas. The most engaged person on the site,
      disappointed at the one moment they were paying attention.

      Nothing new needed computing. The score and the weak areas were already
      in the request; they were simply never put in the reply.

      "AI COO" is also gone from this copy — the product was repositioned away
      from that phrase months ago and this email was still using it.
    */
    /* The only free text echoed back to the caller: no URLs, domains or
       addresses, capped (see plainCallerText). */
    const firstName = plainCallerText(name.split(" ")[0], 40) || "there";
    const isHealthCheck = src === "health-check" && score !== null;

    const band = score === null ? "" : score >= 80 ? "Strong" : score >= 55 ? "Developing" : "At risk";
    const weakLines = weak.length
      ? weak.map((w) => `  • ${w}`).join("\n")
      : "  • Nothing stood out as weak — which is worth knowing too.";

    const userBody = isHealthCheck
      ? `Hi ${firstName},

Here is your Business Health Check, as promised.

YOUR SCORE: ${score}/100 — ${band}

${weak.length ? `WHERE YOU ARE MOST EXPOSED\n${weakLines}` : weakLines}

WHAT THIS SCORE IS, HONESTLY
It is built from six answers you gave about how your business runs — not from
your books. It is a useful mirror, not an audit. The number that would actually
tell you something is the one sitting in your own ledger.

SO HERE IS THE MORE USEFUL VERSION, ALSO FREE
Export your receivables from Tally, Busy, Vyapar, Zoho or Excel and drop the
file in here:

  ${origin}/health-check#ledger

You will get your real overdue total, how many days the oldest one has been
sitting, which customer holds the concentration, and what is past 45 days for
section 43B(h). No account, no card, and we do not keep the file.

That is the same arithmetic Cortex runs on your books every night — the
difference being that it then emails you when something changes.

Reply to this email if anything looks wrong, or message us: https://wa.me/919711488480

— Team MNB Cortex`
      : `Hi ${firstName},

Thanks for your interest in MNB Cortex.

We've received your request for the ${plan || "MNB Cortex"} plan (${cur}, ${cyc}). We'll be in touch shortly to set up your access and answer any questions.

In the meantime, reply to this email or message us on WhatsApp: https://wa.me/919711488480

— Team MNB Cortex`;

    const userHtml = renderBrandedEmail(userBody, {
      linkHosts: ownHosts,
      preheader: isHealthCheck
        ? `Your Business Health Check: ${score}/100 — ${band}`
        : "We received your MNB Cortex request",
    });

    /*
      Both steps, because they are different questions: "how many people gave
      us details" and "how many of those came from the health check". The score
      band goes in meta so the operator can see whether the at-risk cohort
      converts differently from the healthy one — which is the whole reason the
      score is worth keeping.
    */
    recordQuietly("lead_captured", { ip: clientIp(req), path: "/api/inquiry", meta: { source: src, plan: plan || "" } });
    if (isHealthCheck) {
      recordQuietly("healthcheck_done", { ip: clientIp(req), meta: { band, score } });
    }

    const [adminRes, userRes] = await Promise.all([
      sendEmail(notifyTo, `New request: ${plan || "Cortex"} (${cur}) — ${name}`, adminHtml, { from: brandFrom(), replyTo: email }),
      sendEmail(email,
        isHealthCheck ? `Your Business Health Check: ${score}/100` : "We received your MNB Cortex request",
        userHtml, { from: brandFrom(), replyTo: brandReplyTo() }),
    ]);

    /*
      THE REPORT IS THE DELIVERABLE, SO ITS DELIVERY IS NOT A DETAIL.

      This returned a flat ok:true. On the health-check path that is the most
      misleading response in the product: the page says "We'll email the full
      breakdown" and then "Your report is on its way", the report IS the email
      built above, and `userRes.sent` being false means the visitor receives
      nothing at all. sendEmail returns { sent: false, reason } rather than
      throwing, so that outcome was indistinguishable from success and the
      client — which read only `ok` — showed the confirmation screen anyway.

      So the most engaged person on the site, at the one moment they were
      paying attention, was told a report was coming that was never sent. That
      is worse than an error message, because they do not come back.

      `ok` now means we captured the lead (stored, or the operator notified).
      `confirmed` reports whether the visitor's own email went, and the client
      words its success screen from that instead of promising unconditionally.
    */
    const captured = adminRes.sent || stored;
    if (!captured) {
      console.error("[inquiry] NOT captured — email:", adminRes.reason || "?", "| db:", hasSupabase() ? "insert failed" : "no supabase");
      return NextResponse.json({
        ok: false,
        error: "We could not record that just now. Please message us on WhatsApp — that always reaches us.",
      }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      notified: adminRes.sent,
      stored,
      confirmed: userRes.sent,
      adminReason: adminRes.reason,
      userReason: userRes.reason,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
