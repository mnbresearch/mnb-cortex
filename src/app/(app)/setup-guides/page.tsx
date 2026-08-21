import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { SETUP_GUIDES } from "@/lib/setup-guides";
import { AlertTriangle, Clock, ExternalLink, KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connection guides — MNB Cortex",
  description: "Step-by-step instructions for connecting WhatsApp, Shopify, Stripe, Razorpay and Google Sheets to MNB Cortex.",
};

/**
 * Setup instructions for the credentials a customer supplies themselves.
 *
 * These features are bring-your-own-key by design: messages leave from the
 * customer's own WhatsApp number, and their Shopify or Stripe data never routes
 * through a shared platform account. The cost of that design is a setup task,
 * and "paste your access token" is not a usable instruction for an owner who
 * has never opened developers.facebook.com. Everything needed is on this page
 * so nobody has to leave the product to find it.
 */
export default function SetupGuides() {
  return (
    <>
      <Topbar title="Connection guides" subtitle="Get your own keys — and what each one unlocks" />
      <PageShell>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/15 p-2 shrink-0"><KeyRound className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-medium">Why you supply these keys yourself</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
                WhatsApp messages go out from <b>your</b> business number, and your Shopify and Stripe
                data is read from <b>your</b> account — never pooled through ours. That keeps your brand on
                every message and your data under your control, and it means providers bill you directly
                at their own rates with nothing added on top.
              </p>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                Every key is encrypted with AES-256-GCM before it touches the database and is never shown
                again — only a masked hint. Decryption happens server-side, at the moment we call that
                provider on your behalf.
              </p>
              <Link href="/integrations" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                Go to Integrations <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Card>

        {SETUP_GUIDES.map((g) => (
          <Card key={g.provider} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{g.name}</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{g.unlocks}</p>
              </div>
              <a
                href={g.docs} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border h-8 px-3 text-xs hover:bg-accent shrink-0"
              >
                Official docs <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {g.time}
              </span>
              {g.caveat && (
                <span className="inline-flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 max-w-2xl">
                  <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
                  <span>{g.caveat}</span>
                </span>
              )}
            </div>

            <ol className="mt-4 space-y-3">
              {g.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-primary/12 text-primary grid place-items-center text-xs font-semibold tabular">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.title}</div>
                    <p className="text-sm text-muted-foreground mt-0.5">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            {g.gotchas.length > 0 && (
              <div className="mt-4 rounded-lg border border-border/70 bg-muted/30 p-3.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-warning" /> What usually goes wrong
                </div>
                <ul className="mt-2 space-y-1.5">
                  {g.gotchas.map((x, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-warning shrink-0">•</span><span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}

        <Card className="p-5">
          <p className="text-sm font-medium">Stuck on any of these?</p>
          <p className="text-sm text-muted-foreground mt-1">
            Send us the step you're on and we'll walk you through it — or do it with you on a call.
            WhatsApp in particular is fiddly the first time, and it's faster than reading Meta's documentation.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/contact" className="inline-flex items-center rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90 sheen">
              Get help
            </Link>
            <Link href="/help" className="inline-flex items-center rounded-lg border h-9 px-4 text-sm hover:bg-accent">
              Help centre
            </Link>
          </div>
        </Card>
      </PageShell>
    </>
  );
}
