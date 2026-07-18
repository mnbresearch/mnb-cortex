import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const calendar = [
  { form: "GSTR-1", desc: "Outward supplies (monthly)", due: "11th", tone: "warn" },
  { form: "GSTR-3B", desc: "Summary return + tax payment", due: "20th", tone: "danger" },
  { form: "GSTR-2B", desc: "Auto-drafted ITC statement", due: "14th", tone: "flat" },
  { form: "PT / TDS", desc: "Professional tax & TDS deposit", due: "7th", tone: "flat" },
];

const rates = [
  { slab: "0%", ex: "Fresh produce, unbranded staples" },
  { slab: "5%", ex: "Packaged essentials, transport" },
  { slab: "12%", ex: "Processed goods, some industrials" },
  { slab: "18%", ex: "Most manufactured goods & services" },
  { slab: "28%", ex: "Luxury & sin goods" },
];

const tone: Record<string, string> = {
  danger: "bg-danger/10 text-danger border-danger/20",
  warn: "bg-warning/10 text-warning border-warning/20",
  flat: "border-border text-muted-foreground",
};

export default function GST() {
  return (
    <>
      <Topbar title="GST & Compliance" subtitle="Stay filing-ready — with an AI assistant that knows Indian tax" />
      <PageShell>
        <Section title="This month's filing calendar" desc="Key GST due dates — don't miss the 20th">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {calendar.map((c) => (
              <Card key={c.form} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{c.form}</span>
                  <Badge className={tone[c.tone]}>Due {c.due}</Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">{c.desc}</div>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Ask the GST assistant" desc="ITC, rates, place of supply, e-invoicing, returns">
          <AIPanel mode="gst" placeholder="e.g. Can I claim ITC on a company vehicle? What's the rate on my product?" cta="Ask the GST assistant" multiline saveMode="strategy" />
          <p className="text-xs text-muted-foreground mt-2">General guidance only — confirm edge cases with your chartered accountant.</p>
        </Section>

        <Section title="GST rate slabs" desc="Quick reference">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {rates.map((r) => (
              <Card key={r.slab} className="p-4">
                <div className="text-xl font-bold">{r.slab}</div>
                <div className="text-xs text-muted-foreground mt-1">{r.ex}</div>
              </Card>
            ))}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
