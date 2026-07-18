import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { FundingCalculator } from "@/components/funding-calculator";

export const dynamic = "force-dynamic";

const sources = [
  { name: "Working-capital loan / CC", note: "Best for receivables gaps — flexible, interest on usage" },
  { name: "Term loan", note: "For capex/equipment — fixed EMI, longer tenure" },
  { name: "Invoice discounting", note: "Unlock cash from overdue invoices fast" },
  { name: "MSME / MUDRA schemes", note: "Government-backed, lower rates for eligible SMEs" },
];

export default function Funding() {
  return (
    <>
      <Topbar title="Funding & Loans" subtitle="Model the cost of capital before you borrow" />
      <PageShell>
        <FundingCalculator />
        <Section title="Funding options for Indian SMEs" desc="Match the instrument to the need">
          <div className="grid sm:grid-cols-2 gap-3">
            {sources.map((s) => (
              <Card key={s.name} className="p-4"><div className="font-medium text-sm">{s.name}</div><div className="text-sm text-muted-foreground">{s.note}</div></Card>
            ))}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
