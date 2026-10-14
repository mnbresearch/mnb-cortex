import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { BriefPanel } from "@/components/brief-panel";
import { BriefEmailer } from "@/components/brief-emailer";

export const dynamic = "force-dynamic";

export default function Brief() {
  return (
    <>
      <Topbar title="Daily CEO Brief" subtitle="The one thing that matters today, in 60 seconds" />
      <PageShell>
        <BriefPanel />
        <BriefEmailer />
        <Section title="Automate it" desc="Never open the app to stay informed">
          {/* Was a developer note ("add your Resend key… ask me to wire up the
              schedule"). Scheduled briefs already exist under Reports. */}
          <p className="text-sm text-muted-foreground">
            Schedule the brief under <Link href="/reports" className="text-primary underline">Reports → Scheduled reports</Link>:
            choose &ldquo;brief&rdquo;, pick daily, weekly or monthly, and Cortex emails it from your live numbers.
          </p>
        </Section>
      </PageShell>
    </>
  );
}
