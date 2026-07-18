import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { BroadcastComposer } from "@/components/broadcast-composer";

export const dynamic = "force-dynamic";

const segments = ["Lapsed customers (30+ days)", "Top 20 accounts", "New leads this month", "Region: South", "Premium-X buyers"];

export default function Broadcast() {
  return (
    <>
      <Topbar title="WhatsApp Broadcast Composer" subtitle="Write once, send to the right segment" />
      <PageShell>
        <BroadcastComposer />
        <Section title="Suggested segments" desc="Who to target — pair with the message above">
          <div className="flex flex-wrap gap-2">
            {segments.map((s) => <Card key={s} className="px-3 py-2 text-sm text-muted-foreground">{s}</Card>)}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Always include a clear opt-out and only message customers who've consented, per WhatsApp policy.</p>
        </Section>
      </PageShell>
    </>
  );
}
