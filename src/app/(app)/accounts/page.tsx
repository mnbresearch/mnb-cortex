import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

export default function Accounts() {
  return (
    <>
      <Topbar title="Account Plans" subtitle="A growth plan for your most important customers" />
      <PageShell>
        <Section title="Build an account plan" desc="Describe the customer — get whitespace, risks and the next moves">
          <AIPanel mode="account" placeholder="e.g. Apex Traders — ₹18 L/mo, our largest account, buys Standard-100 only, payments slipping to 48 days, relationship is with one buyer." cta="Build account plan" multiline saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
