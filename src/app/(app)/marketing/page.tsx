import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const ideas = [
  "Launch Premium-X in the South region",
  "Win-back offer for lapsed customers",
  "Festive-season bulk B2B campaign",
  "Referral program for top accounts",
];

export default function Marketing() {
  return (
    <>
      <Topbar title="Marketing Studio" subtitle="Campaigns, captions and messages — ready to send" />
      <PageShell>
        <Section title="Create a campaign" desc="Describe the goal — Cortex writes the whole kit">
          <AIPanel mode="marketing" placeholder="e.g. A 10-day festive campaign to push Premium-X to distributors in the West" cta="Generate the campaign kit" multiline saveMode="strategy" />
        </Section>
        <Section title="Need a starting point?" desc="Tap an idea, paste it above, and generate">
          <div className="flex flex-wrap gap-2">
            {ideas.map((i) => <Badge key={i} className="border-border text-muted-foreground">{i}</Badge>)}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
