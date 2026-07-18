import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";
import { ScenarioPlanner } from "@/components/scenario-planner";
import { TrendingUp, Wallet, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const drivers = [
  { label: "Revenue momentum", detail: "West region + Premium-X ramp", tone: "up" },
  { label: "Margin pressure", detail: "RM-204 input cost +9%, unrepriced", tone: "down" },
  { label: "Receivables drag", detail: "₹72 L overdue, 5 accounts >45 days", tone: "down" },
  { label: "New SKU adoption", detail: "Premium-X mix rising each week", tone: "up" },
];

export default function Forecast() {
  return (
    <>
      <Topbar title="Forecasting & Scenarios" subtitle="See the next 90 days before they happen" />
      <PageShell>
        <div className="grid sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4 text-success" /> Projected revenue (90d)</div>
            <div className="text-2xl font-bold mt-1">₹13.6 Cr</div>
            <div className="text-xs text-success mt-0.5">+11% vs prior quarter</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4 text-warning" /> Cash runway</div>
            <div className="text-2xl font-bold mt-1">~5 months</div>
            <div className="text-xs text-warning mt-0.5">Tightens in Nov without action</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-danger" /> Forecast confidence</div>
            <div className="text-2xl font-bold mt-1">High</div>
            <div className="text-xs text-muted-foreground mt-0.5">Based on 6 months of trend</div>
          </Card>
        </div>

        <ScenarioPlanner />

        <Section title="AI forecast" desc="A CFO-grade 90-day outlook grounded in your live numbers">
          <AIPanel mode="forecast" placeholder="Optional: focus the forecast (e.g. 'if we win the Dubai order' or 'cash only')" cta="Generate 90-day forecast" saveMode="strategy" />
        </Section>

        <Section title="What's driving the forecast" desc="The levers the model is weighting most">
          <div className="grid sm:grid-cols-2 gap-3">
            {drivers.map((d) => (
              <Card key={d.label} className="p-4 flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm">{d.label}</div>
                  <div className="text-sm text-muted-foreground">{d.detail}</div>
                </div>
                <Badge className={d.tone === "up" ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20"}>
                  {d.tone === "up" ? "Tailwind" : "Headwind"}
                </Badge>
              </Card>
            ))}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
