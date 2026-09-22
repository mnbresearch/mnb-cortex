import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret, maskSecret, encryptionAvailable } from "@/lib/crypto";
import { integrationById, planAllows, limitForPlan } from "@/lib/integrations";
import { safeFetch, BlockedUrlError } from "@/lib/net-guard";
import { statusFor, statusForAttempt, lastTestOk, shouldPersistResult } from "@/lib/integration-status";
import { SHOPIFY_API_VERSION } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * Summarises integration state through the model.
 *
 * Every other AI route in this app sets an explicit budget (30-300s); these
 * seven did not, so they silently inherited whatever the platform default
 * happens to be. That default is not ours to control and has changed between
 * Vercel plans and runtimes, which is a poor thing to hang the product's
 * headline feature on: the failure mode is a 504 with no log line, and the
 * user just sees a button that did nothing.
 */
export const maxDuration = 60;

const RANK: Record<string, number> = { viewer: 1, analyst: 2, manager: 3, admin: 4, owner: 5 };

/** Only admins/owners of the active workspace may touch credentials. */
async function guard() {
  if (!hasSupabase()) throw new Error("Not configured");
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Sign in to manage integrations");
  /*
    The ACTIVE workspace, not an arbitrary membership row.

    This was `.limit(1).single()` with no ordering and no reference to the
    cortex_org cookie — so for anyone in more than one workspace (a CA in
    Practice mode, a consultant, us) Postgres returned whichever row it felt
    like. The page would show workspace B while the POST wrote the credential
    into workspace A, and the role check ran against A's role rather than B's.

    Harmless-ish when the payload was a Shopify domain. Not harmless now that it
    can be an AI provider key, because the key decides where that workspace's
    prompts go.

    getUserAndOrg() is the same resolver the pages use: it honours the cookie
    and only after verifying the user is still a member of it.
  */
  const { getUserAndOrg } = await import("@/lib/data");
  const { orgId } = await getUserAndOrg();
  if (!orgId) throw new Error("No workspace found");

  const { data: mem } = await sb.from("memberships")
    .select("role").eq("user_id", user.id).eq("org_id", orgId).maybeSingle();
  if (!mem) throw new Error("No workspace found");
  if ((RANK[(mem as any).role] || 0) < RANK.admin) throw new Error("Only workspace admins can manage integrations");
  const { data: org } = await sb.from("organizations").select("plan").eq("id", orgId).single();
  return { sb, orgId, plan: (org as any)?.plan || "watch" };
}

/**
 * Verifies credentials against the provider's real API. Never returns the secret.
 *
 * `verified` says whether a real call actually happened. 18 of the 63 catalogue
 * providers have a case below; the rest fall to the `default`, which stores the
 * credential without checking it. Both used to return a bare `ok: true`, so the
 * caller could not tell "the provider accepted this" from "nobody asked" — and
 * recorded the second as the first. See lib/integration-status.ts.
 */
async function testCredentials(id: string, c: Record<string, string>): Promise<{ ok: boolean; verified: boolean; message: string; unreachable?: boolean }> {
  const j = (r: Response, okMsg: string) => r.ok
    ? { ok: true, verified: true, message: okMsg }
    : { ok: false, verified: true, message: `Provider rejected the credentials (${r.status})` };
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
      /*
        `c.shop` is free text the customer saved. Every other case here targets
        a hardcoded vendor host; these two take a URL the customer chose and
        fetch it from our server, which is inside the hosting network. Without
        a check, `shop = "169.254.169.254"` makes this a proxy to the cloud
        metadata endpoint, and the returned status is an oracle either way.
      */
      /* Imported rather than re-typed: this probe and the sync MUST test the
         same API version, or "Connected to Shopify" can pass against a version
         the sync does not use. Both were independently pinned to 2024-01, which
         Shopify stopped serving in early 2025. */
      case "shopify": return j(await safeFetch(`https://${c.shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, { headers: { "X-Shopify-Access-Token": c.api_key } }), "Connected to Shopify");
      case "razorpay": {
        const auth = Buffer.from(`${c.key_id}:${c.key_secret}`).toString("base64");
        return j(await fetch("https://api.razorpay.com/v1/payments?count=1", { headers: { Authorization: `Basic ${auth}` } }), "Connected to Razorpay");
      }
      case "slack": {
        try {
          const r = await safeFetch(c.webhook_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "✅ MNB Cortex connected successfully." }) });
          return r.ok ? { ok: true, verified: true, message: "Test message sent to Slack" } : { ok: false, verified: true, message: `Slack rejected the webhook (${r.status})` };
        } catch (e: any) {
          if (e instanceof BlockedUrlError) return { ok: false, verified: true, message: e.message };
          throw e;
        }
      }
      case "zoho_books": return j(await fetch(`https://www.zohoapis.in/books/v3/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${c.api_key}` } }), "Connected to Zoho Books");
      case "sendgrid": return j(await fetch("https://api.sendgrid.com/v3/user/profile", { headers: { Authorization: `Bearer ${c.api_key}` } }), "Connected to SendGrid");
      case "brevo": return j(await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": c.api_key } }), "Connected to Brevo");
      case "calendly": return j(await fetch("https://api.calendly.com/users/me", { headers: { Authorization: `Bearer ${c.api_key}` } }), "Connected to Calendly");
      case "intercom": return j(await fetch("https://api.intercom.io/me", { headers: { Authorization: `Bearer ${c.api_key}`, Accept: "application/json" } }), "Connected to Intercom");
      case "typeform": return j(await fetch("https://api.typeform.com/me", { headers: { Authorization: `Bearer ${c.api_key}` } }), "Connected to Typeform");
      /*
        WHATSAPP IS TESTABLE, AND WAS NOT BEING TESTED.

        lib/whatsapp.ts already had verifyWhatsApp() written for "the
        integrations Test button" — and it had no callers anywhere, because
        there was no case here. So WhatsApp fell to the `default` branch and
        was reported as stored-without-verification, on the one integration
        where a wrong credential is most expensive: it is what collections
        sends the customer's own debtor reminders through.

        Verified against the credentials just entered rather than anything read
        back, and the Graph call returns the verified business name and phone
        number, so the customer sees WHICH account they connected — the useful
        confirmation for a provider where having two Meta apps is common.
      */
      case "whatsapp": {
        const { verifyWhatsAppCreds } = await import("@/lib/whatsapp");
        const r = await verifyWhatsAppCreds({
          token: String(c.api_key || c.token || "").trim(),
          phoneNumberId: String(c.phone_number_id || "").trim(),
        });
        return { ok: r.ok, verified: true, message: r.detail };
      }
      /*
        BYO AI keys. Tests each key the workspace supplied with ONE real,
        minimal model call — a "Test" that only checks the string is non-empty
        tells someone they are connected and lets them discover otherwise from
        an empty report three days later.
      */
      case "ai": {
        const { verifyProviderKey, PROVIDERS } = await import("@/lib/ai/byo");
        const present = PROVIDERS
          .map((prov) => ({ prov, k: String((c as any)[prov.id] || "").trim() }))
          .filter((x) => x.k);
        if (!present.length) return { ok: false, verified: false, message: "No keys entered. Add at least one provider key." };

        /*
          In PARALLEL. Sequentially, four providers at a 15s timeout each is 60s
          against this route's maxDuration of 60 — a workspace with all four
          keys and one slow provider would get a 504 instead of an answer.
        */
        const settled = await Promise.all(
          present.map(async ({ prov, k }) => ({ prov, r: await verifyProviderKey(prov.id, k) })),
        );
        const anyOk = settled.some((x) => x.r.ok);
        return { ok: anyOk, verified: true, message: settled.map((x) => `${x.prov.name}: ${x.r.ok ? "✓" : "✗"} ${x.r.detail}`).join("  ·  ") };
      }
      /*
        NO TEST EXISTS FOR THIS PROVIDER — and `verified: false` is how that
        gets said out loud. `ok` stays true because storing the credential did
        succeed and there is nothing to complain about; it is simply not
        evidence that the credential works, and the caller now records the
        difference instead of flattening it into a green "Live" badge.
      */
      default: return { ok: true, verified: false, message: "Saved securely. This provider has no automated test — confirm it from the provider's own dashboard." };
    }
  } catch (e: any) {
    /*
      WE NEVER REACHED THE PROVIDER, SO WE LEARNED NOTHING.

      This returned `verified: true` — meaning "a real call happened and the
      answer was no". A thrown fetch is the opposite: DNS failure, egress
      block, TLS problem, provider outage. Recording that as a rejection
      stamped `status: "error"` and `last_test_ok: false` onto a credential
      that may be perfectly good, and the badge then told the customer to go
      and reconnect it.

      `unreachable` makes the caller skip the write entirely, so an outage
      leaves the last real verdict standing.
    */
    return { ok: false, verified: false, unreachable: true, message: e?.message || "Could not reach the provider — this says nothing about your credentials. Try again shortly." };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const op = String(body?.op || "");
    const id = String(body?.id || "");
    const { sb, orgId, plan } = await guard();

    /*
      Rate limit. `test` makes up to four outbound provider calls per hit, each
      with a 15-second timeout, and every one spends the customer's tokens (or
      ours). Admin-only is not a rate limit — one admin with a loop is enough to
      burn a provider quota or hold four connections open indefinitely.

      Connect is bucketed more loosely: it also tests, but it is a deliberate
      action somebody performs a handful of times.
    */
    const { enforce } = await import("@/lib/ratelimit");
    const over = op === "test"
      ? await enforce([{ key: `integrations:test:org:${orgId}`, limit: 30, windowSecs: 3600 }])
      : await enforce([{ key: `integrations:write:org:${orgId}`, limit: 120, windowSecs: 3600 }]);
    if (over) {
      return NextResponse.json({
        ok: false, rateLimited: true,
        error: "Too many integration requests for this workspace in the last hour. Try again shortly.",
      }, { status: 429 });
    }

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
      /*
        Quota gate — with BYO AI keys exempt.

        A workspace running on its own provider key costs us nothing in model
        spend; counting that against their integration allowance would be
        charging them for the privilege of saving us money, and it would hit
        exactly the enterprise buyer we most want to say yes to.
      */
      const { count } = await sb.from("integrations").select("id", { count: "exact", head: true }).eq("org_id", orgId);
      const limit = limitForPlan(plan);
      const { data: existing } = await sb.from("integrations").select("id").eq("org_id", orgId).eq("provider", id).maybeSingle();
      if (id !== "ai" && !existing && (count || 0) >= limit) {
        return NextResponse.json({ ok: false, error: `Your ${plan} plan allows ${limit} integrations. Upgrade to connect more.`, upgrade: "premium" }, { status: 200 });
      }

      const creds: Record<string, string> = {};
      for (const f of meta.fields) {
        const v = String(body?.credentials?.[f.key] ?? "").trim();
        if (f.required && !v) return NextResponse.json({ ok: false, error: `${f.label} is required.` }, { status: 200 });
        if (v) creds[f.key] = v;
      }

      /*
        Every AI field is optional (one provider is enough), which means an
        empty submit would otherwise store {} and show as "connected" while
        every call silently fell back to the platform key. Require at least one.
      */
      if (!Object.keys(creds).length) {
        return NextResponse.json({ ok: false, error: `Enter at least one value for ${meta.name}.` }, { status: 200 });
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

      /*
        `status` and `last_test_ok` now distinguish tested from untested.

        Was: `status: test.ok ? "connected" : "error"` and
        `last_test_ok: test.ok`. Since the default branch of testCredentials
        returned ok:true for 45 of 63 providers, that stored "connected" and
        `last_test_ok: true` — a positive test result — for a credential no
        call had been made against. `last_test_at` was stamped too, so the row
        claimed a test happened at a specific time.
      */
      const { error } = await sb.from("integrations").upsert({
        org_id: orgId,
        provider: id,
        /*
          statusForAttempt, not statusFor: a provider we could not REACH while
          connecting must be stored as `saved`, not branded `error`. The
          credential still has to be written either way — the customer just
          entered it — so unlike the Test path this cannot decline to write.
        */
        status: statusForAttempt(test.ok, test.verified, test.unreachable),
        config: {
          ...publicConfig, hint,
          last_test_ok: lastTestOk(test.ok, test.verified),
          // Only stamp a time when something actually ran.
          last_test_at: test.verified ? new Date().toISOString() : null,
        },
        credentials_encrypted: encrypted,
      }, { onConflict: "org_id,provider" });
      if (error) throw new Error(error.message);

      return NextResponse.json({ ok: true, tested: test.ok, verified: test.verified, message: test.message });
    }

    if (op === "test") {
      const { data: row } = await sb.from("integrations").select("credentials_encrypted").eq("org_id", orgId).eq("provider", id).maybeSingle();
      const raw = (row as any)?.credentials_encrypted;
      if (!raw) return NextResponse.json({ ok: false, error: "Not connected" });
      const dec = decryptSecret(raw);
      if (!dec) return NextResponse.json({ ok: false, error: "Could not decrypt stored credentials (ENCRYPTION_KEY may have changed)." });
      const test = await testCredentials(id, JSON.parse(dec));
      /*
        THE "TEST" BUTTON NO LONGER CLAIMS TO HAVE TESTED.

        This returned `ok: test.ok` and the client painted a tick — so for the
        45 providers with no test case, pressing Test produced a success tick
        without a single outbound request. The one control whose entire purpose
        is to answer "is this actually working?" was answering yes on the
        strength of having been clicked.

        `ok: test.verified && test.ok` means an untestable provider answers no
        (with `verified: false` and a message saying why) rather than a
        counterfeit yes.
      */
      if (shouldPersistResult(test.unreachable)) {
        /*
          `config` IS MERGED, AND THAT FIXES A BILLING BUG.

          This wrote `{ status }` and nothing else — as did the version before
          it, so this is long-standing rather than new. But lib/ai/byo.ts
          decides whether to waive AI credits from the OTHER field:

              verified = (row as any)?.config?.last_test_ok === true;

          So the two could disagree, and the disagreement pointed the wrong
          way: a workspace connects a valid provider key (last_test_ok: true),
          later revokes it at the provider, presses Test — status became
          "error", the badge went amber, and `last_test_ok` stayed true. byo.ts
          therefore still reported `own: true`, credits stayed waived, and the
          call fell back to OUR platform key. Free usage on our account, which
          byo.ts's own comment says must never happen.

          Read-modify-write because `config` is a single jsonb column: writing
          `{ config: {...} }` replaces it wholesale, so the hint, the phone id
          and every other public field would be destroyed by a Test press.
        */
        const { data: cur } = await sb.from("integrations")
          .select("config").eq("org_id", orgId).eq("provider", id).maybeSingle();
        const merged = {
          ...(((cur as any)?.config) || {}),
          last_test_ok: lastTestOk(test.ok, test.verified),
          last_test_at: test.verified ? new Date().toISOString() : null,
        };
        const { error: upErr } = await sb.from("integrations")
          .update({ status: statusFor(test.ok, test.verified), config: merged })
          .eq("org_id", orgId).eq("provider", id);
        if (upErr) console.error("[integrations] test result not persisted —", upErr.message);
      }
      return NextResponse.json({
        ok: test.verified && test.ok,
        verified: test.verified,
        unreachable: Boolean(test.unreachable),
        message: test.message,
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown operation" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
