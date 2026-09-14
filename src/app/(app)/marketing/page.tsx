import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
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
        {/*
          THIS PAGE STILL HAD THE BACKWARDS GATE THE OTHER SIX FIXED.

          Six sibling pages (vendors, costs, negotiate, risks, hiring,
          strategy) show this same illustrative-data label and all six had
          `{signedIn && (...)}` removed, with a comment explaining why: gating
          it on being signed in means the logged-out visitor — the person with
          the least context about whose numbers these are — sees the worked
          example with NO disclaimer, while the customer who can already tell
          it apart from their own dashboard gets the warning. This page was
          missed, so it kept the inverted behaviour.

          Unconditional now, which also makes the page static: `orgId` was
          fetched on every request solely to compute this gate, so removing it
          removes a cookie read, an auth.getUser() and a membership lookup per
          view.
        */}
        <Card className="p-4 text-sm text-muted-foreground">
          The examples below are illustrative, not your data. Use the AI panel on this page to get this analysis
          built from your own numbers.
        </Card>
        {/* "Need a starting point? Tap an idea, paste it above" sat over
            non-interactive <Badge> spans. Now buttons inside the panel — see
            AIPanel's `suggestions` prop. */}
        <Section title="Create a campaign" desc="Describe the goal — Cortex writes the whole kit">
          <AIPanel
            mode="marketing"
            placeholder="e.g. A 10-day festive campaign to push Premium-X to distributors in the West"
            aria-label="Describe the campaign goal"
            cta="Generate the campaign kit"
            multiline
            saveMode="strategy"
            suggestions={ideas}
          />
        </Section>
      </PageShell>
    </>
  );
}
