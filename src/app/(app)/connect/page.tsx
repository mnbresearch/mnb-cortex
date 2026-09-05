import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { getIntegrationState } from "@/lib/data";
import { INTEGRATIONS } from "@/lib/integrations";
import { ConnectKeys } from "@/components/connect-keys";
import { KeyRound, ShieldCheck, Plug, ArrowRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * One page that answers "how do I connect Cortex to my own stuff?"
 *
 * WHY THIS EXISTS SEPARATELY FROM /integrations.
 *
 * /integrations is a 62-entry catalogue grid. It is the right screen for
 * browsing what is available and the wrong one for the two things people
 * actually arrive wanting to do: put in their own AI key, and find out what is
 * already connected. Those were buried behind a scroll and a category filter.
 *
 * This page leads with the AI key because that is the question an enterprise
 * asks first — whose account is my data going through — and because a workspace
 * on its own key pays no AI credits, which is worth saying loudly.
 */
export default async function Connect() {
  /*
    ADMIN ONLY, because this page's own copy says so and because
    2026_integrations_lockdown makes the database agree. Without the check a
    viewer would land on a page that renders empty for reasons they cannot see,
    which reads as broken rather than as "not for you".
  */
  const { hasRole } = await import("@/lib/roles");
  if (!(await hasRole("admin"))) {
    return (
      <>
        <Topbar title="Connect" subtitle="Your keys, your accounts — Cortex runs on them" />
        <PageShell>
          <Card className="p-6 text-sm max-w-2xl">
            <div className="font-medium">Connections are managed by admins and owners.</div>
            <p className="text-muted-foreground mt-2 leading-6">
              An AI provider key decides where this workspace&rsquo;s data is sent, and the other
              credentials here can move money and messages — so they are kept to the people who can
              already do those things. Ask an admin if something needs connecting.
            </p>
          </Card>
        </PageShell>
      </>
    );
  }

  const state = await getIntegrationState();
  const ai = state.connections.find((c) => c.provider === "ai");
  const others = state.connections.filter((c) => c.provider !== "ai");
  const aiMeta = INTEGRATIONS.find((i) => i.id === "ai")!;

  return (
    <>
      <Topbar title="Connect" subtitle="Your keys, your accounts — Cortex runs on them" />
      <PageShell>
        {!state.live && (
          <Card className="p-5 text-sm">
            <a href="/login" className="text-primary underline">Sign in</a> to connect your accounts.
          </Card>
        )}

        {state.live && (
          <>
            {/*
              Encryption state, said up front rather than discovered on save.
              lib/crypto.ts refuses to store a secret when ENCRYPTION_KEY is
              missing — which is the right call, but finding out only after
              typing a key into a form is a poor way to learn it.
            */}
            {!state.encryption && (
              <Card className="p-4 text-sm border-danger/30 bg-danger/5">
                <div className="font-medium text-danger">Credential storage is not configured.</div>
                <p className="text-muted-foreground mt-1 leading-6">
                  The server has no <code>ENCRYPTION_KEY</code>, so Cortex will refuse to store any key
                  rather than keep it in plain text. Nothing on this page will save until that is set.
                </p>
              </Card>
            )}

            <Section
              title="Use your own AI provider"
              desc="Your account, your data-processing terms, and no AI credits charged"
            >
              <ConnectKeys
                fields={aiMeta.fields.map((f) => ({ key: f.key, label: f.label, placeholder: f.placeholder, help: f.help }))}
                connected={Boolean(ai)}
                canManage={state.canManage}
                encryption={state.encryption}
              />

              <Card className="p-5 mt-3 text-sm space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="leading-6">
                    <div className="font-medium">What happens to a key you paste here</div>
                    <p className="text-muted-foreground mt-1">
                      Encrypted with AES-256-GCM before it touches the database, decrypted only on the
                      server at the moment of a call, never written to a log, and redacted from your
                      workspace export. Only admins and owners can reach this page or read the stored
                      value. The key itself is never sent back to a browser — the only thing kept in
                      readable form is a short masked hint (first three and last four characters) so you
                      can tell which key is which. Remove it whenever you like and Cortex falls straight
                      back to its own key.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <KeyRound className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="leading-6">
                    <div className="font-medium">Why you might want to</div>
                    <p className="text-muted-foreground mt-1">
                      Your prompts go to your provider account under your own retention and
                      data-processing settings, which is usually what a security review is asking about.
                      You can cap and monitor spend from the provider&rsquo;s own console. And while a key
                      is connected, Cortex charges you <strong>no AI credits at all</strong> — the model
                      cost is already yours, so billing you again would be charging twice for one call.
                    </p>
                  </div>
                </div>
                <div className="text-muted-foreground leading-6">
                  Add more than one and they become genuine failover: if a provider rate-limits or
                  retires a model, Cortex walks down the list rather than failing.
                </div>
              </Card>
            </Section>

            <Section title="Everything else" desc="Accounting, commerce, messaging and the rest">
              <Card className="p-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="leading-6">
                    <div className="font-medium">
                      {others.length
                        ? `${others.length} connection${others.length === 1 ? "" : "s"} in place`
                        : "Nothing else connected yet"}
                    </div>
                    <p className="text-muted-foreground">
                      {others.length
                        ? others.map((c) => c.provider).join(" · ")
                        : "Shopify, Razorpay, Stripe and Google Sheets sync automatically. Tally, Vyapar and Busy work by uploading their export files."}
                    </p>
                  </div>
                  <Link href="/integrations"
                    className="inline-flex items-center gap-2 rounded-lg border h-9 px-4 text-sm font-medium hover:bg-accent shrink-0">
                    <Plug className="h-4 w-4" /> Browse all integrations <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Card>
            </Section>

            <Section title="Let something else talk to Cortex" desc="The other direction: your systems reading and writing your workspace">
              <Card className="p-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted-foreground leading-6 max-w-2xl">
                    Issue an API key to push invoices, orders or inventory into Cortex from your own
                    software, and subscribe a webhook to be told when an alert fires or an invoice goes
                    past due. Both live under Developers.
                  </p>
                  <Link href="/developers"
                    className="inline-flex items-center gap-2 rounded-lg border h-9 px-4 text-sm font-medium hover:bg-accent shrink-0">
                    <KeyRound className="h-4 w-4" /> API &amp; webhooks <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Card>
            </Section>
          </>
        )}
      </PageShell>
    </>
  );
}
