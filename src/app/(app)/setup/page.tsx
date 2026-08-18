import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import { envKey, anyEnvKey } from "@/lib/env";
import { hasServiceRole } from "@/lib/supabase/server";
import { hasWhatsApp } from "@/lib/whatsapp";
import { hasCashfree } from "@/lib/pay/cashfree";
import { hasVideoProvider } from "@/lib/ai/video";
import { isSuperAdmin } from "@/lib/superadmin";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Setup status — the single page that says what is actually switched on.
 *
 * Every capability below is fully built. The ones marked "needs a key" are
 * waiting on a credential only the operator can supply; they light up the
 * moment the variable exists, with no code change.
 *
 * Super-admin only: it enumerates which platform credentials are configured.
 */
type Row = { name: string; on: boolean; env: string; what: string; how: string };

export default async function Setup() {
  if (!(await isSuperAdmin())) redirect("/dashboard");

  const rows: Row[] = [
    { name: "Database (Supabase)", on: hasServiceRole(), env: "SUPABASE_SERVICE_ROLE_KEY",
      what: "Workspaces, KPIs, invites, credits, webhooks — everything server-side.",
      how: "Supabase → Project Settings → API → service_role." },
    { name: "AI engine", on: anyEnvKey("GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"), env: "GEMINI_API_KEY",
      what: "Chat, Deep Dive, reports, agents, bank & GST readers, AI Visibility.",
      how: "Free key at aistudio.google.com/apikey — no card required." },
    { name: "Image agents", on: Boolean(envKey("GEMINI_API_KEY")), env: "GEMINI_API_KEY",
      what: "80 image agents — product mockups, cleanup, material swaps.",
      how: "Same Gemini key as the AI engine. Nothing extra to do." },
    { name: "Video agents", on: hasVideoProvider(), env: "GEMINI_API_KEY",
      what: "14 video agents via Google Veo.",
      how: "Same Gemini key. Veo access is included on current Gemini API keys." },
    { name: "Email (Resend)", on: Boolean(envKey("RESEND_API_KEY")), env: "RESEND_API_KEY",
      what: "Renewal reminders, scheduled reports, invites, outreach, daily briefs.",
      how: "resend.com/api-keys, then verify your sending domain." },
    { name: "Payments (Cashfree)", on: hasCashfree(), env: "CASHFREE_APP_ID + CASHFREE_SECRET_KEY",
      what: "Plan checkout and credit top-ups.",
      how: "Cashfree → Developers → API Keys. Set CASHFREE_ENV=sandbox to test." },
    { name: "WhatsApp (Meta Cloud API)", on: hasWhatsApp(), env: "WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID",
      what: "Real WhatsApp sending from AI Outreach — not wa.me links.",
      how: "Needs a Meta WhatsApp Business account and approved templates. See SETUP.md → WhatsApp." },
    { name: "Integration credential vault", on: Boolean(envKey("ENCRYPTION_KEY")), env: "ENCRYPTION_KEY",
      what: "Encrypts the third-party keys customers store in Integrations.",
      how: "Generate with: openssl rand -base64 32" },
    { name: "Scheduled jobs", on: Boolean(envKey("CRON_SECRET")), env: "CRON_SECRET",
      what: "Renewals, scheduled reports, webhook retries, KPI sweep, plan expiry.",
      how: "Any long random string. Vercel's own cron header also authorises it." },
  ];

  const live = rows.filter((r) => r.on).length;

  return (
    <>
      <Topbar title="Setup status" subtitle="What's switched on, and what's waiting on a key" />
      <PageShell>
        <Card className="p-5">
          <div className="text-2xl font-semibold">{live} of {rows.length} capabilities live</div>
          <p className="text-sm text-muted-foreground mt-1">
            Everything here is fully built. Anything not live is waiting on a credential only you can supply — it starts
            working the moment the variable exists in Vercel, with no code change and no redeploy of logic.
          </p>
        </Card>

        <Section title="Capabilities">
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.name} className={`rounded-lg border p-4 ${r.on ? "" : "border-warning/30 bg-warning/5"}`}>
                <div className="flex items-start gap-3">
                  {r.on
                    ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    : <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">
                      {r.name}{" "}
                      <span className={`text-[11px] rounded px-1.5 py-0.5 ${r.on ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                        {r.on ? "live" : "needs a key"}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{r.what}</div>
                    {!r.on && (
                      <div className="text-xs mt-1.5 flex items-start gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                        <span><code className="bg-secondary px-1 rounded">{r.env}</code> — {r.how}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Needs more than a key" desc="Honest about what a credential alone won't fix">
          <div className="space-y-2 text-sm">
            <Card className="p-4">
              <div className="font-medium">Tally</div>
              <p className="text-muted-foreground mt-0.5">
                Tally listens on localhost on the machine it runs on, so a cloud app physically cannot reach it. Run{" "}
                <code className="bg-secondary px-1 rounded">scripts/tally-bridge.mjs</code> next to Tally and it pushes
                vouchers into Cortex through the public API. Fully written — see SETUP.md → Tally.
              </p>
            </Card>
            <Card className="p-4">
              <div className="font-medium">SSO / SAML</div>
              <p className="text-muted-foreground mt-0.5">
                Requires a Supabase Pro plan; SAML is configured on the Supabase project, not in this codebase.
                Until then, Enterprise SSO should be sold as "on request".
              </p>
            </Card>
            <Card className="p-4">
              <div className="font-medium">The 62-tool integration catalogue</div>
              <p className="text-muted-foreground mt-0.5">
                Four providers pull data automatically — <b>Shopify</b>, <b>Razorpay</b>, <b>Stripe</b> and{" "}
                <b>Google Sheets</b> — on demand and nightly. The rest of the catalogue securely stores and verifies
                credentials but does not sync yet; those customers import via CSV, the bank/GST readers, the public API
                or the Tally bridge. Adding a connector is one function in <code className="bg-secondary px-1 rounded">src/lib/sync</code>.
              </p>
            </Card>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
