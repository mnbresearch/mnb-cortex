import { getUserAndOrg } from "@/lib/data";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { BroadcastComposer } from "@/components/broadcast-composer";

export const dynamic = "force-dynamic";

const segments = ["Lapsed customers (30+ days)", "Top 20 accounts", "New leads this month", "Region: South", "Premium-X buyers"];

export default async function Broadcast() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);

  return (
    <>
      <Topbar title="WhatsApp Broadcast Composer" subtitle="Write once, send to the right segment" />
      <PageShell>
        {/*
          THE GATE WAS INVERTED, AND THIS IS THE SIXTH PAGE WITH IT.

          `{signedIn && (...)}` showed the "these are examples, not your data"
          card ONLY to a signed-in customer — so the logged-out visitor, the one
          person with no way to tell an invented figure from a real one, saw the
          worked example with no warning at all. marketing/page.tsx documents the
          fix and names the pages it was applied to; these were missed.

          Unconditional is correct. A signed-in owner also benefits from being
          told which numbers on the page are illustrative, and the cost of
          saying so twice is a sentence.
        */}
        <Card className="p-4 text-sm text-muted-foreground">
          The examples below are illustrative, not your data. Use the AI panel on this page to get this analysis
          built from your own numbers.
        </Card>
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
