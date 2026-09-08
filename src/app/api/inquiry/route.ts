import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/operators";
import { renderBrandedEmail, brandFrom, brandReplyTo } from "@/lib/branded-email";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { clientIp, contactFormLimits, enforce } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cap = (v: any, n: number) => String(v ?? "").slice(0, n);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const name = cap(body.name, 120).trim();
    const email = cap(body.email, 200).trim();
    const phone = cap(body.phone, 30).trim();
    const { plan, currency, cycle, source } = body;
    const note = cap(body.note, 2000);
    const company = cap(body.company, 160).trim();
    /*
      The score arrives as a number from the health check and is absent for
      every other caller. Clamped rather than trusted: it is submitted from the
      browser, and it drives the operator's "call the worst first" ordering.
    */
    const rawScore = Number(body.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
    const weak: string[] = Array.isArray(body.weak) ? body.weak.map((w: any) => cap(w, 80)).slice(0, 8) : [];
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

    const src = cap(source || "pricing", 40);

    // Where the operator gets notified (defaults to ADMIN_EMAIL; override with LEAD_NOTIFY_EMAIL).
    const notifyTo = process.env.LEAD_NOTIFY_EMAIL || ADMIN_EMAIL;
    const origin = (() => { try { return new URL(req.url).origin; } catch { return "https://cortex.mnbresearch.com"; } })();
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const cur = (currency || "INR").toString().toUpperCase();
    const cyc = cycle === "annual" ? "Annual" : "Monthly";

    // Persist the lead first (best-effort) so nothing is lost even if email fails.
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
        const { error } = await createClient().from("leads").insert(row);
        if (error) {
          /*
            Deploy-before-migrate: this ships before anyone runs the migration.
            Retry with the original four columns rather than losing the lead
            entirely — a lead with less detail beats no lead at all.
          */
          const { company: _c, note: _n, score: _s, ...core } = row;
          await createClient().from("leads").insert(core);
        }
      } catch {}
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
    const adminHtml = renderBrandedEmail(adminBody, { preheader: `${plan || "Cortex"} request from ${name} (${cur})` });

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
    const firstName = name.split(" ")[0] || "there";
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
      preheader: isHealthCheck
        ? `Your Business Health Check: ${score}/100 — ${band}`
        : "We received your MNB Cortex request",
    });

    const [adminRes, userRes] = await Promise.all([
      sendEmail(notifyTo, `New request: ${plan || "Cortex"} (${cur}) — ${name}`, adminHtml, { from: brandFrom(), replyTo: email }),
      sendEmail(email,
        isHealthCheck ? `Your Business Health Check: ${score}/100` : "We received your MNB Cortex request",
        userHtml, { from: brandFrom(), replyTo: brandReplyTo() }),
    ]);

    return NextResponse.json({ ok: true, notified: adminRes.sent, confirmed: userRes.sent, adminReason: adminRes.reason, userReason: userRes.reason });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
