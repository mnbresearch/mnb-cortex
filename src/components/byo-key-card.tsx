"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExternalLink, ChevronDown, ChevronRight, KeyRound, Check, LifeBuoy } from "lucide-react";
import type { ByoKey } from "@/lib/byok";

/**
 * A credential Cortex cannot supply, explained properly.
 *
 * Most products render "paste your API key" and an empty box, which is why most
 * BYO-key integrations are never connected — the owner does not know what the
 * key is, where it lives, what it costs, or whether they even need it.
 *
 * So this leads with WHY WE CANNOT PROVIDE IT. An owner who thinks we are being
 * lazy will go looking for a competitor who "includes WhatsApp"; one who
 * understands that Meta issues credentials per business, and that using ours
 * would put THEIR number at risk, will go and get their own.
 *
 * It also states plainly what still works without it. A feature that appears to
 * be gated behind a 45-minute setup gets abandoned; one that already works over
 * email and gets BETTER with WhatsApp gets set up that evening.
 */
export function ByoKeyCard({ spec, connected }: { spec: ByoKey; connected: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium">{spec.capability}</span>
            {connected && (
              <span className="rounded-full border border-success/20 bg-success/10 text-success px-2 py-0.5 text-[11px] font-medium">
                <Check className="h-3 w-3 inline mr-0.5" /> Connected
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">via {spec.provider}</div>
        </div>
        <Link href="/integrations" className="shrink-0">
          <Button size="sm" variant={connected ? "outline" : "default"}>
            {connected ? "Manage" : "Connect"}
          </Button>
        </Link>
      </div>

      {/* The honest part, first. */}
      <div className="mt-4 rounded-lg border bg-background p-3 text-sm">
        <div className="font-medium">Why you have to bring this yourself</div>
        <p className="text-muted-foreground mt-1 leading-6">{spec.whyNotIncluded}</p>
      </div>

      <div className="mt-3 grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Time to set up</div>
          <div className="mt-0.5">{spec.timeEstimate}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Cost</div>
          <div className="mt-0.5">{spec.cost}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Without it</div>
          <div className="mt-0.5">{spec.withoutIt}</div>
        </div>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Step-by-step: getting your {spec.provider.split(" (")[0]} credentials
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <ol className="space-y-2.5">
            {spec.steps.map((s, i) => (
              <li key={s.title} className="flex gap-3 text-sm">
                <span className="h-6 w-6 rounded-full bg-secondary grid place-items-center text-xs font-medium shrink-0">{i + 1}</span>
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-muted-foreground leading-6">{s.detail}</div>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-lg border p-3">
            <div className="text-sm font-medium">What you will end up pasting into Cortex</div>
            <div className="mt-2 space-y-1.5">
              {spec.fields.map((f) => (
                <div key={f.key} className="text-sm flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.hint}</span>
                  {f.secret && (
                    <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground">stored encrypted</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">Official documentation</div>
            <div className="flex flex-wrap gap-2">
              {spec.docs.map((d) => (
                <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 h-8 text-xs hover:bg-accent transition-colors">
                  {d.label} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>

          {/*
            The escape hatch. Some owners will not finish this alone, and the
            honest options are: hand it to whoever runs their website, or ask us.
            Without this, the realistic outcome is abandonment.
          */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm flex items-start gap-2.5">
            <LifeBuoy className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Stuck, or would rather not do this yourself?</span>{" "}
              This is the kind of thing whoever manages your website or IT can finish in half an hour. If you do not
              have anyone, <Link href="/help" className="text-primary underline">contact our team</Link> and we will
              walk you through it on a call — we cannot create the account for you, but we can sit with you while you do.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
