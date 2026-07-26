import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const monthly = [
  { day: "7", item: "TDS / TCS deposit", note: "Tax deducted in the previous month", tone: "warn" },
  { day: "10", item: "GSTR-7 / GSTR-8", note: "TDS/TCS under GST (if applicable)", tone: "flat" },
  { day: "11", item: "GSTR-1", note: "Outward supplies (monthly filers)", tone: "warn" },
  { day: "13", item: "GSTR-6 / IFF", note: "Input service distributor / QRMP invoices", tone: "flat" },
  { day: "15", item: "PF & ESI payment", note: "Provident fund and ESI contributions", tone: "danger" },
  { day: "20", item: "GSTR-3B", note: "Summary return + GST payment", tone: "danger" },
  { day: "25", item: "PMT-06", note: "GST payment for QRMP scheme", tone: "flat" },
];

const periodic = [
  { when: "15 Jun / Sep / Dec / Mar", item: "Advance tax instalments", note: "15% / 45% / 75% / 100% of estimated liability" },
  { when: "31 Jul", item: "Income Tax Return (individuals)", note: "Non-audit cases" },
  { when: "31 Oct", item: "ITR + Tax Audit", note: "Audit cases (44AB)" },
  { when: "30 Sep / 31 Oct", item: "ROC filings (AOC-4, MGT-7)", note: "For companies, post-AGM" },
  { when: "Quarterly", item: "TDS returns (24Q/26Q)", note: "31 Jul, 31 Oct, 31 Jan, 31 May" },
];

const tone: Record<string, string> = { danger: "bg-danger/10 text-danger border-danger/20", warn: "bg-warning/10 text-warning border-warning/20", flat: "border-border text-muted-foreground" };

export default function Compliance() {
  return (
    <>
      <Topbar title="Compliance Calendar" subtitle="India statutory due dates — never miss a filing" />
      <PageShell>
        <Section title="Every month" desc="Recurring monthly obligations (dates are typical; verify for your category)">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {monthly.map((d) => (
              <Card key={d.item} className="p-4 flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg brand-gradient grid place-items-center text-white font-bold shrink-0">{d.day}</div>
                <div><div className="flex items-center gap-2"><span className="font-medium text-sm">{d.item}</span><Badge className={tone[d.tone]}>day {d.day}</Badge></div><div className="text-xs text-muted-foreground">{d.note}</div></div>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Quarterly & annual" desc="The bigger deadlines to plan around">
          <div className="space-y-2">
            {periodic.map((p) => (
              <Card key={p.item} className="p-4 flex items-center gap-3">
                <div className="flex-1"><div className="font-medium text-sm">{p.item}</div><div className="text-xs text-muted-foreground">{p.note}</div></div>
                <Badge className="border-border text-muted-foreground">{p.when}</Badge>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Ask the compliance assistant" desc="Filings, applicability, penalties, procedure">
          <AIPanel mode="gst" placeholder="e.g. Do I need to file GSTR-9? What's the penalty for late TDS payment?" cta="Ask" multiline saveMode="strategy" />
          <p className="text-xs text-muted-foreground mt-2">General guidance only — confirm specifics with your CA/CS. Dates can shift with government notifications.</p>
        </Section>
      </PageShell>
    </>
  );
}
