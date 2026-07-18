import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AIPanel } from "@/components/ai-panel";
import { BriefEmailer } from "@/components/brief-emailer";

export const dynamic = "force-dynamic";

export default function Brief() {
  return (
    <>
      <Topbar title="Daily CEO Brief" subtitle="The one thing that matters today, in 60 seconds" />
      <PageShell>
        <Section title="Today's brief" desc="Freshly generated from your live business snapshot">
          <AIPanel mode="brief" placeholder="" cta="Generate today's brief" saveMode="strategy" />
        </Section>
        <BriefEmailer />
        <Section title="Automate it" desc="Never open the app to stay informed">
          <p className="text-sm text-muted-foreground">Your AI Autopilot already runs a daily analysis in the background. Add your Resend email key and this brief can land in your inbox every morning automatically — ask me to wire up the schedule.</p>
        </Section>
      </PageShell>
    </>
  );
}
