import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { KpiCard } from "@/components/kpi-card";
import { InsightCard } from "@/components/insight-card";
import { Section } from "@/components/section";
import { TrendChart } from "@/components/charts/trend-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, statusBg } from "@/lib/utils";
import { getMetrics, getInsights, getAlerts } from "@/lib/data";
import { demoRevenueSeries } from "@/lib/demo";
import { AlertTriangle, Sparkles } from "lucide-react";
import { PrintButton, ExportButton } from "@/components/export-button";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [metrics, insights, alerts] = await Promise.all([getMetrics(), getInsights(), getAlerts()]);
  const reds = metrics.filter((m) => m.status === "red").length;
  const overall = reds >= 2 ? "needs attention" : reds === 1 ? "mostly healthy" : "healthy";

  return (
    <>
      <Topbar title="Business Health" subtitle="One page. Everything that matters." />
      <PageShell>
        <div className="flex justify-end gap-2 no-print">
          <ExportButton rows={metrics} filename="business-health.csv" columns={["label","value","unit","delta_pct","status"]} />
          <PrintButton />
        </div>
        {/* AI summary banner */}
        <Card className="p-5 bg-gradient-to-br from-primary/10 to-purple-500/5 border-primary/20">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/15 p-2"><Sparkles className="h-5 w-5 text-primary" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Your business is {overall}.</p>
                <Badge className="border-primary/30 text-primary">AI summary</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Revenue is up 12% but net profit slipped 7% on rising raw-material cost. Cash runway is ~5 months and RM-204 risks a stockout in 9 days — I’ve drafted a purchase order and flagged overdue receivables of ₹72 L.
              </p>
              <Link href="/chat" className="inline-flex text-sm text-primary font-medium mt-2">Ask: “How is my business?” →</Link>
            </div>
          </div>
        </Card>

        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {metrics.map((m, i) => <KpiCard key={m.id} m={m} i={i} />)}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Section title="Revenue, profit & cash" desc="Trailing 12 months (₹ Cr)">
              <TrendChart data={demoRevenueSeries} keys={[
                { k: "revenue", label: "Revenue", color: "hsl(var(--primary))" },
                { k: "profit", label: "Net profit", color: "hsl(var(--success))" },
                { k: "cash", label: "Cash", color: "hsl(var(--warning))" },
              ]} />
            </Section>
          </div>

          {/* Alerts */}
          <Card>
            <div className="p-5 pb-2 font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Alerts</div>
            <div className="p-3 pt-1 space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className={cn("rounded-lg border p-3", statusBg[a.severity])}>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs opacity-80 mt-0.5">{a.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* AI Insights & recommended actions */}
        <div>
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Insights & recommended actions</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {insights.map((ins) => <InsightCard key={ins.id} ins={ins} />)}
          </div>
        </div>
      </PageShell>
    </>
  );
}
