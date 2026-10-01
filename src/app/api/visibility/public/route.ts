import { NextResponse } from "next/server";
import { runVisibility, defaultPrompts } from "@/lib/ai/visibility";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/operators";
import { renderBrandedEmail, brandFrom, brandReplyTo } from "@/lib/branded-email";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { clientIp, enforce, visibilityLimits } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Public AI Visibility teaser — the only endpoint that runs a model without a
 * session, because it's the top-of-funnel lead magnet. It is deliberately
 * cheap (3 prompts) AND rate limited per email, per IP and globally, so it
 * can't be farmed for free AI. See src/lib/ratelimit.ts.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({} as any));
    const name = String(b.name || "").trim();
    const email = String(b.email || "").trim();
    const brand = String(b.brand || "").trim();
    const category = String(b.category || "").trim();
    const location = String(b.location || "").trim();
    if (!name || !email || !brand) return NextResponse.json({ ok: false, error: "Name, email and brand are required." }, { status: 200 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 200 });

    // Throttle BEFORE spending anything on the model.
    const exceeded = await enforce(visibilityLimits(email, clientIp(req)));
    if (exceeded) {
      const global = exceeded.key === "vis:global";
      return NextResponse.json({
        ok: false, rateLimited: true,
        error: global
          ? "The free visibility check is at capacity for today. Please try again tomorrow, or start a trial for unlimited checks."
          /*
            There is no free trial to start — TRIAL_DAYS is 0. Offering one in
            a rate-limit message is the same false claim the landing page
            carried, in the one place a visitor is already mildly annoyed.
          */
          : "You've used your free visibility checks for today. Come back tomorrow, or create a workspace to run them whenever you like.",
      }, { status: 429 });
    }

    /*
      ==========================================================================
      THE THIRD LEAD-CAPTURE PATH IN THE PRODUCT, AND THE ONE I MISSED
      ==========================================================================

      /api/inquiry and /api/access-request both check the returned error, fall
      back to a narrower row, and log when a lead is lost. They were given that
      treatment deliberately — a prospect who types their name and email is the
      most valuable thing this site produces, and losing one is unrecoverable
      because they will not come back and do it again.

      This path was written the same day and left as:

        try { await ...insert({...}) } catch {}

      which has two independent faults:

        · PostgREST REPORTS, IT DOES NOT THROW. A rejected insert returns
          `{ error }`. The catch was unreachable for the failure it was written
          for, so there was no handling at all — not weak handling.

        · THE ONLY OTHER RECORD IS ALSO BEST-EFFORT. The operator notification
          below sits in its own bare `catch {}`. Both failing together — one
          database hiccup — means a prospect handed over their name, email and
          brand, saw a score, and left no trace anywhere in the system.

      `org_id` is deliberately absent: the anon RLS policy is
      `with check (org_id is null)` (2026_rls_privilege_fix.sql), which is how
      a public form writes a lead nobody owns yet. Setting it would be rejected
      — and, before this change, rejected silently.
    */
    let leadStored = false;
    if (hasSupabase()) {
      try {
        const { error } = await (await createClient()).from("leads").insert({
          name, email, phone: null,
          plan: `AI Visibility · ${brand}`,
          source: "ai-visibility",
        });
        leadStored = !error;
        if (error) console.error("[visibility] lead not stored —", error.message);
      } catch (e: any) {
        console.error("[visibility] lead insert threw —", e?.message);
      }
    }

    // Teaser: 3 prompts only (keeps the public endpoint cheap).
    /* crossCheck: 0 — this endpoint is free and unauthenticated, so it stays
       at one engine and three calls. See runVisibility's note. */
    const report = await runVisibility(brand, [], defaultPrompts(category, location), 3, { crossCheck: 0 });
    const shown = report.results.filter((r) => r.mentioned).length;

    // Notify the operator so warm leads surface immediately.
    let notified = false;
    try {
      const origin = (() => { try { return new URL(req.url).origin; } catch { return "https://cortex.mnbresearch.com"; } })();
      const body = `A prospect ran a free AI Visibility check.

Name: ${name}
Email: ${email}
Brand: ${brand}
Category: ${category || "—"}   Location: ${location || "—"}
AI Visibility score: ${report.score}/100 (${shown}/${report.results.length} answers)
Engine: ${report.engine}

See all leads: ${origin}/leads
Reply to this email to reach ${name.split(" ")[0] || "them"} directly.`;
      await sendEmail(process.env.LEAD_NOTIFY_EMAIL || ADMIN_EMAIL, `AI Visibility lead: ${brand} — ${name}`, renderBrandedEmail(body, { preheader: `AI Visibility check by ${name}` }), { from: brandFrom(), replyTo: email });
      notified = true;
    } catch (e: any) {
      console.error("[visibility] operator notification failed —", e?.message);
    }

    /*
      Neither record survived. This is the one combination that loses a
      prospect outright, so it escalates — the alert goes to the operator
      console, which does not depend on email, and carries the details so the
      lead can be followed up from the alert itself rather than mourned.

      Not raised to the visitor: they asked for a visibility score and got a
      correct one. Our filing problem is not their problem, and telling them
      "we may have lost your details" invites them to re-submit into the same
      fault.
    */
    if (!leadStored && !notified) {
      try {
        const { operatorAlert } = await import("@/lib/operator-alert");
        await operatorAlert({
          kind: "lead_lost",
          severity: "red",
          title: `Lost an AI Visibility lead: ${brand}`,
          body:
            `A prospect completed the free AI Visibility check and NEITHER the ` +
            `database insert nor the notification email succeeded, so this is the ` +
            `only record of them.\n\n` +
            `Name: ${name}\nEmail: ${email}\nBrand: ${brand}\n` +
            `Category: ${category || "—"}   Location: ${location || "—"}\n` +
            `Score: ${report.score}/100 (${shown}/${report.results.length} answers)\n\n` +
            `Add them to /leads by hand and check the leads table and email provider.`,
          email: false,
        });
      } catch (e: any) {
        console.error("[visibility] LEAD LOST and alert failed —", name, email, brand, e?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      brand,
      score: report.score,
      engine: report.engine,
      grounded: report.grounded,
      shown, total: report.results.length,
      competitors: report.competitors.slice(0, 5),
      sample: report.results[0] ? { prompt: report.results[0].prompt, mentioned: report.results[0].mentioned, answer: (report.results[0].answer || "").slice(0, 320) } : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Check failed — please try again." }, { status: 200 });
  }
}
