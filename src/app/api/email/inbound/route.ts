import { NextResponse } from "next/server";
import { createClient, serviceClient, hasSupabase } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { getUserAndOrg } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  if (!hasSupabase()) throw new Error("Not configured");
  if (!(await isSuperAdmin())) throw new Error("Not authorised");
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) throw new Error("No workspace found");
  const svc = serviceClient();
  if (!svc) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return { sb: createClient(), svc, orgId };
}

export async function POST(req: Request) {
  try {
    const { sb, svc, orgId } = await ctx();
    const body = await req.json().catch(() => ({} as any));
    const op = String(body?.op || "");
    const origin = new URL(req.url).origin;

    if (op === "status") {
      const { data } = await svc.from("app_settings").select("key,value").eq("org_id", orgId).in("key", ["resend_webhook_secret", "inbound_address"]);
      const m = Object.fromEntries(((data as any[]) || []).map((r) => [r.key, r.value]));
      return NextResponse.json({ ok: true, webhookConfigured: Boolean(m.resend_webhook_secret), address: m.inbound_address || "", endpoint: `${origin}/api/inbound/resend` });
    }

    if (op === "setup") {
      const key = process.env.RESEND_API_KEY;
      if (!key) return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" });
      const r = await fetch("https://api.resend.com/webhooks", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ endpoint: `${origin}/api/inbound/resend`, events: ["email.received"] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return NextResponse.json({ ok: false, error: j?.message || `Resend ${r.status}. Inbound may not be enabled on your account.` });
      const secret = j.signing_secret || j.secret || j.data?.signing_secret || j.data?.secret;
      if (secret) await svc.from("app_settings").upsert({ org_id: orgId, key: "resend_webhook_secret", value: secret, updated_at: new Date().toISOString() }, { onConflict: "org_id,key" });
      return NextResponse.json({ ok: true, webhookId: j.id || j.data?.id, secretStored: Boolean(secret) });
    }

    if (op === "set_address") {
      const addr = String(body.address || "").trim();
      if (!addr) return NextResponse.json({ ok: false, error: "Address required" });
      await svc.from("app_settings").upsert({ org_id: orgId, key: "inbound_address", value: addr, updated_at: new Date().toISOString() }, { onConflict: "org_id,key" });
      return NextResponse.json({ ok: true });
    }

    if (op === "list_replies") {
      const { data } = await sb.from("email_replies").select("*").eq("org_id", orgId).order("received_at", { ascending: false }).limit(100);
      return NextResponse.json({ ok: true, replies: (data as any[]) || [] });
    }

    if (op === "mark_read") {
      await sb.from("email_replies").update({ is_read: true }).eq("id", body.id).eq("org_id", orgId);
      return NextResponse.json({ ok: true });
    }

    if (op === "simulate") {
      // Local test: inject a reply as if a recipient replied. Never touches Resend.
      const from = String(body.from || "").trim().toLowerCase();
      const text = String(body.text || "This is a simulated reply for testing.");
      if (!from) return NextResponse.json({ ok: false, error: "From email required" });
      const { data: rec } = await sb.from("campaign_recipients").select("id,campaign_id").ilike("email", from).order("created_at", { ascending: false }).limit(1).maybeSingle();
      await svc.from("email_replies").insert({
        org_id: orgId, resend_email_id: `sim-${Date.now()}`, campaign_id: (rec as any)?.campaign_id || null, recipient_id: (rec as any)?.id || null,
        from_email: from, to_email: "inbound@simulated", subject: "Re: your email", text, verified: false,
      });
      if ((rec as any)?.id) await sb.from("campaign_recipients").update({ status: "replied" }).eq("id", (rec as any).id);
      return NextResponse.json({ ok: true, linked: Boolean((rec as any)?.id) });
    }

    return NextResponse.json({ ok: false, error: "Unknown operation" }, { status: 400 });
  } catch (e: any) {
    const code = /authorised/i.test(e?.message || "") ? 403 : 200;
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: code });
  }
}
