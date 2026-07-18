import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";
import { Handshake, Truck, Users } from "lucide-react";

export const dynamic = "force-dynamic";

const plays = [
  { icon: Truck, title: "Supplier price hike", note: "RM-204 up 9% — push back with volume + backup-supplier leverage" },
  { icon: Users, title: "Big customer renewal", note: "Trade terms (payment days) instead of price to protect margin" },
  { icon: Handshake, title: "New vendor onboarding", note: "Anchor on your target, keep a walk-away in your pocket" },
];

export default function Negotiate() {
  return (
    <>
      <Topbar title="Negotiation Coach" subtitle="Walk in with leverage, targets and a talk track" />
      <PageShell>
        <div className="grid sm:grid-cols-3 gap-3">
          {plays.map((p) => (
            <Card key={p.title} className="p-4">
              <p.icon className="h-5 w-5 text-primary" />
              <div className="font-medium text-sm mt-2">{p.title}</div>
              <div className="text-sm text-muted-foreground">{p.note}</div>
            </Card>
          ))}
        </div>
        <Section title="Prep a negotiation" desc="Describe the deal — Cortex builds your leverage map, targets and script">
          <AIPanel mode="negotiate" placeholder="e.g. My biggest supplier wants a 9% price rise on RM-204. I buy ₹40 L/month. Help me negotiate." cta="Build my negotiation plan" multiline saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
