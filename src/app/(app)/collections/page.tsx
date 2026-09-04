import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { getUserAndOrg } from "@/lib/data";
import { getPolicy, findCandidates, getRecovery } from "@/lib/collections";
import { serviceClient } from "@/lib/supabase/server";
import { CollectionsConsole } from "@/components/collections-console";
import { CollectionsSettings } from "@/components/collections-settings";
import { ByoKeyCard } from "@/components/byo-key-card";
import { byoKey } from "@/lib/byok";
import { hasWhatsAppFor } from "@/lib/whatsapp";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const rupee = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/**
 * Collections — the module that turns a warning into money.
 *
 * Everywhere else Cortex tells the owner what is wrong. Here it does something
 * about it: drafts the reminder, waits to be approved, sends it, watches for
 * payment, and reports what came back.
 *
 * The page is arranged around that being SAFE rather than around it being
 * clever. What is about to be sent is shown in full, in the order it would go,
 * with every blocked invoice and the reason it was blocked — because the thing
 * an owner needs to trust is not that Cortex is smart, it is that Cortex will
 * not embarrass them in front of a customer.
 */
export default async function Collections() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) {
    return (
      <>
        <Topbar title="Collections" subtitle="Chase what you're owed — without doing it by hand" />
        <PageShell><Card className="p-6 text-sm text-muted-foreground">Sign in to a workspace to use collections.</Card></PageShell>
      </>
    );
  }

  const [policy, candidates, recovery, waEnabled] = await Promise.all([
    getPolicy(orgId), findCandidates(orgId), getRecovery(orgId), hasWhatsAppFor(orgId),
  ]);

  const svc = serviceClient();
  let pending: any[] = [];
  if (svc) {
    const { data } = await svc.from("collection_messages")
      .select("id, thread_id, attempt, channel, recipient, subject, body, status, created_at, error")
      .eq("org_id", orgId).in("status", ["draft", "approved", "failed"])
      .order("created_at", { ascending: false }).limit(50);
    pending = (data as any[]) || [];
  }

  const chaseable = candidates.filter((c) => !c.blockedBy);
  const blocked = candidates.filter((c) => c.blockedBy);

  return (
    <>
      <Topbar title="Collections" subtitle="Cortex chases what you're owed, in your name, with your approval" />
      <PageShell>
        {/*
          The Prove layer, first thing on the page.

          This is the number that renews the subscription, and it is deliberately
          conservative: only invoices where Cortex actually sent something and
          the money then arrived. Counting payments that would have come anyway
          would make it bigger and worthless.
        */}
        <div className="grid sm:grid-cols-4 gap-3">
          <Card className={`p-4 ${recovery.amountRecovered > 0 ? "border-success/30 bg-success/5" : ""}`}>
            <div className="text-sm text-muted-foreground">Recovered (90 days)</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{rupee(recovery.amountRecovered)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {recovery.invoicesRecovered} invoice{recovery.invoicesRecovered === 1 ? "" : "s"} paid after a reminder
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Still chasing</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{rupee(recovery.amountChasing)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{recovery.stillChasing} open</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Reminders sent</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{recovery.messagesSent}</div>
            <div className="text-xs text-muted-foreground mt-0.5">last 90 days</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Ready to chase</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{chaseable.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {rupee(chaseable.reduce((n, c) => n + c.amount, 0))} overdue
            </div>
          </Card>
        </div>

        {!policy.enabled && (
          <Card className="p-4 border-primary/20 bg-primary/5 text-sm flex items-start gap-2.5">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Collections is off.</span>{" "}
              Nothing has been drafted and nothing can be sent. Turn it on below, generate the drafts, and read them —
              you approve every message before it leaves. Cortex never messages your customers without you.
            </div>
          </Card>
        )}

        <CollectionsConsole
          policy={{ enabled: policy.enabled, autoSend: policy.auto_send, maxPerDay: policy.max_per_day }}
          candidates={chaseable.slice(0, 40)}
          blocked={blocked.slice(0, 40)}
          pending={pending}
        />

        <Section title="How Cortex writes" desc="Fixed wording, escalating in directness only">
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            {[
              { h: "1 · A nudge", p: "Assumes it was simply missed, because it usually was. Opening with an accusation costs a relationship and gains nothing." },
              { h: "2 · A clearer ask", p: "Restates the invoice, the amount and the days overdue, and asks when it will be released." },
              { h: "3 · A date, please", p: "Asks for a specific date and says you will follow up personally. That is the strongest honest position." },
            ].map((c) => (
              <div key={c.h} className="rounded-xl border p-4">
                <div className="font-medium">{c.h}</div>
                <p className="text-muted-foreground mt-1 leading-6">{c.p}</p>
              </div>
            ))}
          </div>
          {/*
            Said out loud, because it is the difference between a tool an owner
            trusts with their customer relationships and one they do not.
          */}
          <p className="text-xs text-muted-foreground mt-3 leading-6">
            Cortex will never mention legal action, notices, courts, recovery agents, credit scores, or interest and
            penalties that were not on the invoice — at any stage, whatever tone you pick. Escalation changes how direct
            the message is, never what it threatens. If your signature or payment note contains language like that,
            Cortex refuses to draft rather than send it in your name.
          </p>
        </Section>

        <Section title="Settings" desc="Who gets chased, how often, and from what time">
          <CollectionsSettings policy={policy} whatsappReady={waEnabled} />
        </Section>

        {!waEnabled && (
          <Section title="Send on WhatsApp" desc="Needs your own WhatsApp Business account — here's exactly how">
            <ByoKeyCard spec={byoKey("whatsapp")!} connected={false} />
          </Section>
        )}
      </PageShell>
    </>
  );
}
