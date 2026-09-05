import { getUserAndOrg } from "@/lib/data";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";
import { ScenarioPlanner, type ScenarioBaseline } from "@/components/scenario-planner";
import { TrendingUp, Wallet, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const drivers = [
  { label: "Revenue momentum", detail: "West region + Premium-X ramp", tone: "up" },
  { label: "Margin pressure", detail: "RM-204 input cost +9%, unrepriced", tone: "down" },
  { label: "Receivables drag", detail: "₹72 L overdue, 5 accounts >45 days", tone: "down" },
  { label: "New SKU adoption", detail: "Premium-X mix rising each week", tone: "up" },
];

/**
 * The scenario baseline, from the workspace's own KPIs.
 *
 * scenario-planner.tsx carried four constants under a comment claiming they
 * were "drawn from the live business snapshot" — ₹4.25 Cr monthly revenue, 12%
 * margin, ₹1.89 Cr reserve. They were read from nothing, so every customer's
 * what-ifs moved a business that does not exist. The misleading comment was the
 * reason it survived: it told each reader the wiring was already there.
 */
async function scenarioBaseline(): Promise<ScenarioBaseline> {
  try {
    const { getMetrics } = await import("@/lib/data");
    const m = await getMetrics();
    const pick = (k: string) => {
      const row = m.find((x) => x.metric_key === k);
      const v = row ? Number(row.value) : NaN;
      return Number.isFinite(v) ? v : null;
    };
    const revenue = pick("revenue");
    const cash = pick("cash_balance");
    /* Margin is a percentage KPI when we have it; 12% is a neutral placeholder
       used only to make the sliders move, and the banner says the baseline is
       unknown whenever revenue is missing. */
    const marginPct = pick("gross_margin") ?? pick("net_profit");
    return {
      revenue,
      margin: marginPct !== null && marginPct > 0 && marginPct < 100 ? marginPct / 100 : null,
      cash,
    };
  } catch {
    return { revenue: null, margin: null, cash: null };
  }
}

export default async function Forecast() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);
  const baseline = await scenarioBaseline();

  return (
    <>
      <Topbar title="Forecasting & Scenarios" subtitle="See the next 90 days before they happen" />
      <PageShell>
        {signedIn && (
          <Card className="p-4 text-sm text-muted-foreground">
            The worked example below is illustrative — it is not your data. Use the AI panel on this page to get the
            same analysis built from your own numbers.
          </Card>
        )}
        {/*
          Labelled inline, not just prefaced by a disclaimer card.

          These three are styled identically to the live KPI cards on
          /dashboard, so a grey note above them does not stop someone reading
          "₹13.6 Cr" as their own projection — especially on a second visit,
          when the note has become furniture. The pattern used elsewhere in this
          codebase (receivables-aging, abc-analysis) marks the block itself.
        */}
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-warning/30 bg-warning/10 text-warning px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Example</span>
          <span className="text-xs text-muted-foreground">Sample figures, not your business</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 opacity-90">
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

        <ScenarioPlanner baseline={baseline} />

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
