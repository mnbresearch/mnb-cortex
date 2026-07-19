import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { SaasMetrics } from "@/components/saas-metrics";

export const dynamic = "force-dynamic";

export default function Saas() {
  return (
    <>
      <Topbar title="SaaS & Subscription Metrics" subtitle="MRR, retention, LTV:CAC — the numbers investors ask for" />
      <PageShell>
        <SaasMetrics />
        <Section title="Which metric actually matters?" desc="A quick guide">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><b>Churn is the silent killer.</b> At 5% monthly churn your average customer lasts 20 months; at 2% they last 50. Cutting churn compounds harder than adding acquisition.</p>
            <p><b>LTV:CAC tells you if growth is profitable.</b> Below 1x you lose money on every customer. Above 3x you can usually afford to spend more to grow faster.</p>
            <p><b>CAC payback tells you if growth is affordable.</b> Even a great LTV:CAC hurts cash if payback takes 24 months — you fund the gap yourself.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
