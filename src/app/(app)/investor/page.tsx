import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";
import { FileBarChart, Send, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

const tips = [
  { icon: Clock, title: "Send monthly", note: "Consistency builds investor trust more than perfect numbers" },
  { icon: FileBarChart, title: "Lead with cash", note: "Investors read runway and burn first — put them up top" },
  { icon: Send, title: "Always include asks", note: "Intros, hires, advice — make it easy for them to help" },
];

export default function Investor() {
  return (
    <>
      <Topbar title="Investor & Board Update" subtitle="A board-ready monthly update in one click" />
      <PageShell>
        <div className="grid sm:grid-cols-3 gap-3">
          {tips.map((t) => (
            <Card key={t.title} className="p-4">
              <t.icon className="h-5 w-5 text-primary" />
              <div className="font-medium text-sm mt-2">{t.title}</div>
              <div className="text-sm text-muted-foreground">{t.note}</div>
            </Card>
          ))}
        </div>
        <Section title="Generate this month's update" desc="Written from your live financials — honest, quantified, board-ready">
          <AIPanel mode="investor" placeholder="Optional: add context (fundraise plans, a big win, a specific ask)" cta="Draft investor update" multiline saveMode="strategy" />
          <p className="text-xs text-muted-foreground mt-2">Save it to your workspace, then export from Reports as a PDF to send.</p>
        </Section>
      </PageShell>
    </>
  );
}
