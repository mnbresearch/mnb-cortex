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

/*
  GST 2.0 slabs, effective 22 September 2025.

  THIS TABLE WAS TWO YEARS OUT OF DATE. It listed 0 / 5 / 12 / 18 / 28 — the
  pre-2025 structure. The 12% and 28% slabs were ABOLISHED: 12% items moved
  mostly to 5%, 28% items to 18%, and a new 40% demerit rate was created for
  luxury and sin goods.

  Being wrong about this is not a cosmetic bug in a product that gives financial
  advice. An owner who spots one obviously stale tax fact stops trusting every
  other number on the screen, and they are right to — trust in a financial tool
  is binary. A wrong slab shown next to a filing calendar also invites a real
  mistake on a real return.

  Any statutory constant in this codebase carries a verified date, the way
  components/tds-calc.tsx does. Re-check at each Budget and each GST Council
  meeting; do not let this drift again.
*/
const RATES_AS_OF = "GST 2.0 · effective 22 September 2025";

const rates = [
  { slab: "0%", ex: "Fresh produce, unbranded staples, health & life insurance" },
  { slab: "5%", ex: "Packaged essentials, transport, most former 12% goods" },
  { slab: "18%", ex: "Standard rate — most goods & services, most former 28% goods" },
  { slab: "40%", ex: "Demerit rate: tobacco, sugary aerated drinks, luxury vehicles" },
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

        <Section title="GST rate slabs" desc={`Quick reference · ${RATES_AS_OF}`}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
