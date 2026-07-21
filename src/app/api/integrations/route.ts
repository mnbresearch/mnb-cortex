import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret, maskSecret, encryptionAvailable } from "@/lib/crypto";
import { integrationById, planAllows, limitForPlan } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK: Record<string, number> = { viewer: 1, analyst: 2, manager: 3, admin: 4, owner: 5 };

/** Only admins/owners of the active workspace may touch credentials. */
async function guard() {
  if (!hasSupabase()) throw new Error("Not configured");
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Sign in to manage integrations");
  const { data: mem } = await sb.from("memberships").select("org_id,role").eq("user_id", user.id).limit(1).single();
  if (!mem) throw new Error("No workspace found");
  if ((RANK[(mem as any).role] || 0) < RANK.admin) throw new Error("Only workspace admins can manage integrations");
  const { data: org } = await sb.from("organizations").select("plan").eq("id", (mem as any).org_id).single();
  return { sb, orgId: (mem as any).org_id as string, plan: (org as any)?.plan || "starter" };
}

/** Verifies credentials against the provider's real API. Never returns the secret. */
async function testCredentials(id: string, c: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const j = (r: Response, okMsg: string) => r.ok ? { ok: true, message: okMsg } : { ok: false, message: `Provider rejected the credentials (${r.status})` };
  try {
    switch (id) {
      case "stripe": return j(await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${c.api_key}` } }), "Connected to Stripe");
      case "resend": return j(await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${c.api_key}` } }), "Connected to Resend");
      case "hubspot": return j(await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", { headers: { Authorization: `Bearer ${c.api_key}` } }), "Connected to HubSpot");
      case "pipedrive": return j(await fetch(`https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(c.api_key)}`), "Connected to Pipedrive");
      case "notion": return j(await fetch("https://api.notion.com/v1/users/me", { headers: { Authorization: `Bearer ${c.api_key}`, "Notion-Version": "2022-06-28" } }), "Connected to Notion");
      case "airtable": return j(await fetch("https://api.airtable.com/v0/meta/bases", { headers: { Authorization: `Bearer ${c.api_key}` } }), "Connected to Airtable");
      case "telegram": return j(await fetch(`https://api.telegram.org/bot${c.bot_token}/getMe`), "Connected to Telegram");
      case "openai": return j(await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${c.api_key}` } }), "Connected to OpenAI");
      case "shopify": return j(await fetch(`https://${c.shop}/admin/api/2024-01/shop.json`, { headers: { "X-Shopify-Access-Token": c.api_key } }), "Connected to Shopify");
      case "razorpay": {
        const auth = Buffer.from(`${c.key_id}:${c.key_secret}`).toString("base64");
        return j(await fetch("https://api.razorpay.com/v1/payments?count=1", { headers: { Authorization: `Basic ${auth}` } }), "Connected to Razorpay");
      }
      case "slack": {
        const r = await fetch(c.webhook_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "✅ MNB Cortex connected successfully." }) });
        return r.ok ? { ok: true, message: "Test message sent to Slack" } : { ok: false, message: `Slack rejected the webhook (${r.status})` };
      }
      case "zoho_books": return j(await fetch(`https://www.zohoapis.in/books/v3/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${c.api_key}` } }), "Connected to Zoho Books");
      default: return { ok: true, message: "Saved. This provider has no automated test — verify from its dashboard." };
    }
  } catch (e: any) {
    return { ok: false, message: e?.message || "Could not reach the provider" };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const op = String(body?.op || "");
    const id = String(body?.id || "");
    const { sb, orgId, plan } = await guard();

    const meta = integrationById(id);
    if (!meta && op !== "disconnect") return NextResponse.json({ ok: false, error: "Unknown integration" }, { status: 400 });

    if (op === "disconnect") {
      const { error } = await sb.from("integrations").delete().eq("org_id", orgId).eq("provider", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (op === "connect") {
      if (!meta) return NextResponse.json({ ok: false, error: "Unknown integration" }, { status: 400 });
      // Plan gate
      if (!planAllows(plan, meta)) {
        return NextResponse.json({ ok: false, error: `${meta.name} requires the ${meta.minPlan} plan or higher.`, upgrade: meta.minPlan }, { status: 200 });
      }
      // Quota gate
      const { count } = await sb.from("integrations").select("id", { count: "exact", head: true }).eq("org_id", orgId);
      const limit = limitForPlan(plan);
      const { data: existing } = await sb.from("integrations").select("id").eq("org_id", orgId).eq("provider", id).maybeSingle();
      if (!existing && (count || 0) >= limit) {
        return NextResponse.json({ ok: false, error: `Your ${plan} plan allows ${limit} integrations. Upgrade to connect more.`, upgrade: "premium" }, { status: 200 });
      }

      const creds: Record<string, string> = {};
      for (const f of meta.fields) {
        const v = String(body?.credentials?.[f.key] ?? "").trim();
        if (f.required && !v) return NextResponse.json({ ok: false, error: `${f.label} is required.` }, { status: 200 });
        if (v) creds[f.key] = v;
      }

      const hasSecret = meta.fields.some((f) => f.type === "password" && creds[f.key]);
      if (hasSecret && !encryptionAvailable()) {
        return NextResponse.json({
          ok: false,
          error: "Credential encryption is not configured on the server (ENCRYPTION_KEY missing). Refusing to store secrets in plaintext.",
        }, { status: 200 });
      }

      // Verify before saving so we never store known-bad credentials.
      const test = await testCredentials(id, creds);

      const encrypted = encryptSecret(JSON.stringify(creds));
      // Only non-secret fields are kept readable, for display.
      const publicConfig: Record<string, string> = {};
      for (const f of meta.fields) if (f.type !== "password" && creds[f.key]) publicConfig[f.key] = creds[f.key];
      const hint = meta.fields.filter((f) => f.type === "password" && creds[f.key]).map((f) => maskSecret(creds[f.key]))[0] || "";

      const { error } = await sb.from("integrations").upsert({
        org_id: orgId,
        provider: id,
        status: test.ok ? "connected" : "error",
        config: { ...publicConfig, hint, last_test_ok: test.ok, last_test_at: new Date().toISOString() },
        credentials_encrypted: encrypted,
      }, { onConflict: "org_id,provider" });
      if (error) throw new Error(error.message);

      return NextResponse.json({ ok: true, tested: test.ok, message: test.message });
    }

    if (op === "test") {
      const { data: row } = await sb.from("integrations").select("credentials_encrypted").eq("org_id", orgId).eq("provider", id).maybeSingle();
      const raw = (row as any)?.credentials_encrypted;
      if (!raw) return NextResponse.json({ ok: false, error: "Not connected" });
      const dec = decryptSecret(raw);
      if (!dec) return NextResponse.json({ ok: false, error: "Could not decrypt stored credentials (ENCRYPTION_KEY may have changed)." });
      const test = await testCredentials(id, JSON.parse(dec));
      await sb.from("integrations").update({ status: test.ok ? "connected" : "error" }).eq("org_id", orgId).eq("provider", id);
      return NextResponse.json({ ok: test.ok, message: test.message });
    }

    return NextResponse.json({ ok: false, error: "Unknown operation" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
