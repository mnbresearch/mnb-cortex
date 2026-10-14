import { NextResponse } from "next/server";
import { createClient, serviceClient, hasSupabase } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { getUserAndOrg } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { type Recipient } from "@/lib/mailmerge";
import { renderBrandedEmail, mergeTokens, brandFrom, brandReplyTo } from "@/lib/branded-email";
import { getCampaignDetail } from "@/lib/email-campaigns";
import { randomBytes } from "crypto";
import { unsubUrl, unsubSigningAvailable } from "@/lib/weekly-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Up to 200 sequential sends; the platform default would kill the loop part-way,
   leaving recipients mailed but recorded as pending and the counters unwritten. */
export const maxDuration = 300;

async function ctx() {
  if (!hasSupabase()) throw new Error("Not configured");
  if (!(await isSuperAdmin())) throw new Error("Not authorised");
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) throw new Error("No workspace found");
  return { sb: await createClient(), svc: serviceClient(), userId: user.id, orgId };
}

export async function POST(req: Request) {
  try {
    const { sb, svc, userId, orgId } = await ctx();
    const body = await req.json().catch(() => ({} as any));
    const op = String(body?.op || "");

    // ---- Templates ----
    if (op === "save_template") {
      const { id, name, subject, body: tbody } = body;
      if (!name || !subject || !tbody) return NextResponse.json({ ok: false, error: "Name, subject and body are required." });
      if (id) {
        const { error } = await sb.from("email_templates").update({ name, subject, body: tbody, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id });
      }
      const { data, error } = await sb.from("email_templates").insert({ org_id: orgId, name, subject, body: tbody, created_by: userId }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: (data as any).id });
    }

    if (op === "delete_template") {
      const { error } = await sb.from("email_templates").delete().eq("id", body.id).eq("org_id", orgId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    // ---- Send a personalised campaign ----
    if (op === "send") {
      const name = String(body.name || "Campaign");
      const subject = String(body.subject || "").trim();
      const tbody = String(body.body || "").trim();
      const recipients: Recipient[] = Array.isArray(body.recipients) ? body.recipients : [];
      if (!subject || !tbody) return NextResponse.json({ ok: false, error: "Subject and body are required." });
      const clean = recipients.filter((r) => r.email && /\S+@\S+\.\S+/.test(r.email));
      if (clean.length === 0) return NextResponse.json({ ok: false, error: "Select at least one valid recipient." });
      if (clean.length > 200) return NextResponse.json({ ok: false, error: "Please send to at most 200 recipients per campaign." });

      const origin = new URL(req.url).origin;

      /*
        BULK MAIL HONOURS UNSUBSCRIBES, AND OFFERS ONE.

        This loop sent with no List-Unsubscribe header, no link in the body,
        and never read email_optouts — so someone who had unsubscribed was
        mailed again by the next campaign. Opt-outs are read with the service
        role (the table has no client policy); if they cannot be read, or links
        cannot be signed, nothing is sent rather than mailing people who said no.
      */
      if (!svc) return NextResponse.json({ ok: false, error: "Can't check the unsubscribe list right now, so nothing was sent." });
      if (!unsubSigningAvailable()) return NextResponse.json({ ok: false, error: "Unsubscribe links can't be signed (no LINK_SIGNING_SECRET or CRON_SECRET), so nothing was sent." });
      const optedOut = new Set<string>();
      {
        const addrs = Array.from(new Set(clean.map((r) => String(r.email).trim().toLowerCase())));
        for (let i = 0; i < addrs.length; i += 100) {
          const { data: oo, error: ooErr } = await svc.from("email_optouts").select("email").in("email", addrs.slice(i, i + 100));
          if (ooErr) return NextResponse.json({ ok: false, error: `Can't check the unsubscribe list (${ooErr.message}), so nothing was sent.` });
          for (const o of (oo as any[]) || []) optedOut.add(String(o.email).trim().toLowerCase());
        }
      }
      const sendable = clean.filter((r) => !optedOut.has(String(r.email).trim().toLowerCase()));
      const suppressed = clean.length - sendable.length;
      if (sendable.length === 0) return NextResponse.json({ ok: false, error: `All ${clean.length} selected recipient${clean.length === 1 ? " has" : "s have"} unsubscribed, so nothing was sent.` });

      // Replies go to a real monitored mailbox (contact@…). If an inbound capture
      // address was configured, that takes precedence.
      // app_settings has RLS enabled with NO policies, so the anon client reads
      // an empty set without erroring — the configured inbound address was
      // silently ignored and replies never reached it. Service client required.
      const { data: addr } = await (svc || sb).from("app_settings")
        .select("value").eq("org_id", orgId).eq("key", "inbound_address").maybeSingle();
      const replyTo = (addr as any)?.value || brandReplyTo();

      const { data: camp, error: cErr } = await sb.from("email_campaigns")
        .insert({ org_id: orgId, name, subject, body: tbody, template_id: body.templateId || null, total: sendable.length, created_by: userId }).select("id").single();
      if (cErr) throw new Error(cErr.message);
      const campaignId = (camp as any).id;

      let sent = 0, failed = 0, unrecorded = 0;
      for (const r of sendable) {
        const token = randomBytes(16).toString("hex");
        const { data: rec, error: recErr } = await sb.from("campaign_recipients")
          .insert({ campaign_id: campaignId, org_id: orgId, name: r.name || null, email: r.email, token, status: "pending" })
          .select("id").single();
        const rid = (rec as any)?.id;
        /* No recipient row means no record of this send and a tracking token
           that resolves to nothing — so do not send it. */
        if (recErr || !rid) {
          failed++;
          console.error("[campaigns] recipient row not written; not sending to this address:", recErr?.message || "no row");
          continue;
        }
        const mv = { name: r.name, email: r.email };
        const personalSubject = mergeTokens(subject, mv);
        const unsub = unsubUrl(String(r.email));
        const html = renderBrandedEmail(
          `${mergeTokens(tbody, mv)}\n\n—\nDon't want these emails? Unsubscribe: ${unsub}`,
          { origin, token, preheader: personalSubject });
        const res = await sendEmail(r.email, personalSubject, html, {
          from: brandFrom(), replyTo, kind: "campaign", orgId,
          headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        if (res.sent) { sent++; } else { failed++; }
        const { data: upRows, error: upErr } = await sb.from("campaign_recipients")
          .update({ status: res.sent ? "sent" : "failed", provider_id: res.providerId || null, error: res.sent ? null : (res.reason || null) })
          .eq("id", rid).select("id");
        if (upErr || !(upRows as any[])?.length) { unrecorded++; console.error("[campaigns] recipient status not recorded:", upErr?.message || "no row matched"); }
      }
      const { data: cntRows, error: cntQueryErr } = await sb.from("email_campaigns").update({ sent_count: sent, failed }).eq("id", campaignId).select("id");
      const cntErr = cntQueryErr || !(cntRows as any[])?.length;
      if (cntErr) console.error("[campaigns] campaign counters not recorded:", cntQueryErr?.message || "no row matched");
      const warning = cntErr || unrecorded
        ? `Sent ${sent}, but ${cntErr ? "the campaign totals" : ""}${cntErr && unrecorded ? " and " : ""}${unrecorded ? `${unrecorded} recipient status${unrecorded === 1 ? "" : "es"}` : ""} could not be saved — the campaign page may show out-of-date figures.`
        : undefined;
      return NextResponse.json({ ok: true, campaignId, total: sendable.length, sent, failed, suppressed, ...(warning ? { warning } : {}) });
    }

    if (op === "detail") {
      const d = await getCampaignDetail(String(body.id || ""));
      if (!d) return NextResponse.json({ ok: false, error: "Not found" });
      return NextResponse.json({ ok: true, ...d });
    }

    // ---- Manually log an outcome (replied / interested / etc.) ----
    if (op === "set_outcome") {
      const { error } = await sb.from("campaign_recipients").update({ outcome: String(body.outcome || "") }).eq("id", body.id).eq("org_id", orgId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown operation" }, { status: 400 });
  } catch (e: any) {
    const code = /authorised/i.test(e?.message || "") ? 403 : 200;
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: code });
  }
}
