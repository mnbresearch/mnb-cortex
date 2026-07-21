import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { IntegrationsManager } from "@/components/integrations-manager";
import { getIntegrationState } from "@/lib/data";
import { PLAN_INTEGRATION_LIMIT } from "@/lib/integrations";
import Link from "next/link";
import { ShieldCheck, KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Integrations() {
  const { connections, plan, canManage, live, encryption } = await getIntegrationState();

  return (
    <>
      <Topbar title="Integrations" subtitle="Connect your tools — securely, on your plan" />
      <PageShell>
        {!live && (
          <Card className="p-4 bg-warning/10 border-warning/20 text-sm">
            <Link href="/login" className="text-primary underline">Sign in</Link> to connect tools to your workspace. You can still import data manually via <Link href="/import" className="text-primary underline">Import data</Link>.
          </Card>
        )}

        {live && !encryption && (
          <Card className="p-4 border-danger/30 bg-danger/5">
            <div className="text-sm flex items-start gap-2">
              <KeyRound className="h-4 w-4 text-danger mt-0.5 shrink-0" />
              <span>
                <b className="text-danger">Credential encryption is not configured.</b> Add an <code className="font-mono">ENCRYPTION_KEY</code> environment
                variable (any long random string) in Vercel. Until then, integrations that require a secret key will be refused rather than stored in plaintext.
              </span>
            </div>
          </Card>
        )}

        <IntegrationsManager plan={plan} connections={connections} canManage={canManage} />

        <Section title="How your credentials are protected" desc="Security model">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" /><span><b className="text-foreground">Encrypted at rest.</b> Every secret is encrypted with AES-256-GCM before it reaches the database. The database never sees a plaintext key.</span></p>
            <p className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" /><span><b className="text-foreground">Never returned to the browser.</b> After saving, only a masked hint (e.g. <span className="font-mono">sk_••••••a4f2</span>) is shown. Decryption happens server-side, only when calling that provider.</span></p>
            <p className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" /><span><b className="text-foreground">Admin-only and workspace-isolated.</b> Only workspace admins and owners can add or remove integrations, and row-level security keeps each workspace's credentials separate.</span></p>
            <p className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" /><span><b className="text-foreground">Verified before saving.</b> We call the provider first — bad keys are rejected rather than silently stored.</span></p>
          </div>
        </Section>

        <Section title="What each plan includes" desc="Integration allowances by tier">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(["starter", "growth", "premium", "enterprise"] as const).map((p) => (
              <Card key={p} className={`p-4 ${plan === p ? "border-primary/40 bg-primary/5" : ""}`}>
                <div className="font-semibold capitalize">{p}</div>
                <div className="text-2xl font-bold mt-1">{PLAN_INTEGRATION_LIMIT[p] === 999 ? "Unlimited" : PLAN_INTEGRATION_LIMIT[p]}</div>
                <div className="text-xs text-muted-foreground">integrations</div>
                <div className="text-xs text-muted-foreground mt-2">
                  {p === "starter" && "Slack, Telegram, Sheets, Resend"}
                  {p === "growth" && "+ Zoho, Tally, Shopify, HubSpot, Stripe, Razorpay, Notion, Airtable"}
                  {p === "premium" && "+ Salesforce, QuickBooks, Meta & Google Ads, Twilio, Gmail, OpenAI"}
                  {p === "enterprise" && "+ External Postgres, custom & on-prem connectors"}
                </div>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Need something not listed? <Link href="/pricing" className="text-primary">Talk to us</Link> — custom connectors are available on Enterprise.</p>
        </Section>
      </PageShell>
    </>
  );
}
