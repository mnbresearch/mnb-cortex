import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { getUserAndOrg } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { type Recipient } from "@/lib/mailmerge";
import { renderBrandedEmail, mergeTokens, brandFrom, brandReplyTo } from "@/lib/branded-email";
import { getCampaignDetail } from "@/lib/email-campaigns";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  if (!hasSupabase()) throw new Error("Not configured");
  if (!(await isSuperAdmin())) throw new Error("Not authorised");
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) throw new Error("No workspace found");
  return { sb: createClient(), userId: user.id, orgId };
}

export async function POST(req: Request) {
  try {
    const { sb, userId, orgId } = await ctx();
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

      // Replies go to a real monitored mailbox (contact@…). If an inbound capture
      // address was configured, that takes precedence.
      const { data: addr } = await sb.from("app_settings").select("value").eq("org_id", orgId).eq("key", "inbound_address").maybeSingle();
      const replyTo = (addr as any)?.value || brandReplyTo();

      const { data: camp, error: cErr } = await sb.from("email_campaigns")
        .insert({ org_id: orgId, name, subject, body: tbody, template_id: body.templateId || null, total: clean.length, created_by: userId }).select("id").single();
      if (cErr) throw new Error(cErr.message);
      const campaignId = (camp as any).id;

      let sent = 0, failed = 0;
      for (const r of clean) {
        const token = randomBytes(16).toString("hex");
        const { data: rec } = await sb.from("campaign_recipients")
          .insert({ campaign_id: campaignId, org_id: orgId, name: r.name || null, email: r.email, token, status: "pending" })
          .select("id").single();
        const rid = (rec as any)?.id;
        const mv = { name: r.name, email: r.email };
        const personalSubject = mergeTokens(subject, mv);
        const html = renderBrandedEmail(mergeTokens(tbody, mv), { origin, token, preheader: personalSubject });
        const res = await sendEmail(r.email, personalSubject, html, { from: brandFrom(), replyTo });
        if (res.sent) { sent++; } else { failed++; }
        if (rid) await sb.from("campaign_recipients").update({ status: res.sent ? "sent" : "failed", provider_id: res.providerId || null, error: res.sent ? null : (res.reason || null) }).eq("id", rid);
      }
      await sb.from("email_campaigns").update({ sent_count: sent, failed }).eq("id", campaignId);
      return NextResponse.json({ ok: true, campaignId, total: clean.length, sent, failed });
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
