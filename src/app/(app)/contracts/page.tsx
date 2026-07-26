import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";
import { ShieldAlert, FileWarning, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

const watch = [
  { icon: ShieldAlert, t: "Liability & indemnity", d: "Uncapped liability is the classic trap" },
  { icon: Clock, t: "Auto-renewal & lock-in", d: "Notice periods that quietly renew you" },
  { icon: FileWarning, t: "Payment & penalties", d: "Late-fees, milestones, clawbacks" },
];

export default function Contracts() {
  return (
    <>
      <Topbar title="Contract Review" subtitle="Paste a clause or contract — get the risks in plain English" />
      <PageShell>
        <div className="grid sm:grid-cols-3 gap-3">
          {watch.map((w) => (
            <Card key={w.t} className="p-4 hover-lift">
              <div className="h-10 w-10 rounded-xl brand-gradient grid place-items-center text-white"><w.icon className="h-5 w-5" /></div>
              <div className="font-medium text-sm mt-2">{w.t}</div>
              <div className="text-sm text-muted-foreground">{w.d}</div>
            </Card>
          ))}
        </div>
        <Section title="Review a contract" desc="Upload a PDF or paste the text — the AI flags obligations, dates and red flags">
          <AIPanel mode="contract" placeholder="Paste the clause or contract text here…" cta="Review this contract" multiline allowFile saveMode="strategy" />
          <p className="text-xs text-muted-foreground mt-2">General guidance only — not legal advice. Have a lawyer confirm anything material before you sign.</p>
        </Section>
      </PageShell>
    </>
  );
}
