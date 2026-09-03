import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { KpiCard } from "@/components/kpi-card";
import { InsightCard } from "@/components/insight-card";
import { Section } from "@/components/section";
import { TrendChart } from "@/components/charts/trend-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, statusBg } from "@/lib/utils";
import { getMetrics, getInsights, getAlerts, getFinanceSeries, getUserAndOrg, getOrgProfile } from "@/lib/data";
import { getRecomputeFailure } from "@/lib/metrics";
import { demoRevenueSeries } from "@/lib/demo";
import { Landmark, ReceiptText, Upload as UploadIcon } from "lucide-react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { PrintButton, ExportButton } from "@/components/export-button";
import { AIPulse } from "@/components/ai-panel";
import { NextBestActions } from "@/components/next-best-actions";
import { IndustryPlaybook } from "@/components/industry-playbook";
import { IndustryPrompt } from "@/components/industry-prompt";
import { resolveIndustry } from "@/lib/industries";
import { CortexScore } from "@/components/cortex-score";
import { InstallCTA } from "@/components/install-cta";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { orgId } = await getUserAndOrg();
  const [metrics, insights, alerts, fin, profile] = await Promise.all([getMetrics(), getInsights(), getAlerts(), getFinanceSeries(), getOrgProfile()]);
  const isReal = Boolean(orgId);                 // signed-in workspace vs public demo preview
  const hasMetrics = metrics.length > 0;
  // Only looked up when there is nothing to show — the healthy path pays nothing.
  const recomputeFailure = isReal && !hasMetrics ? await getRecomputeFailure(orgId) : null;
  const chartData = fin.live && fin.series ? fin.series : (isReal ? [] : demoRevenueSeries);
  // Only plot the series that actually carry data. A derived ledger has real
  // revenue but no profit/cash until costs are known, and a flat zero line would
  // read as "your profit is zero" rather than "we don't know it yet".
  const ALL_KEYS = [
    { k: "revenue", label: "Revenue", color: "hsl(var(--primary))" },
    { k: "profit", label: "Net profit", color: "hsl(var(--success))" },
    { k: "cash", label: "Cash", color: "hsl(var(--warning))" },
  ];
  // When live, plot exactly the series that carry data — even if that's none.
  // Falling back to ALL_KEYS on an empty list would draw three flat zero lines,
  // which is the precise thing this is meant to prevent.
  const chartKeys = fin.live ? ALL_KEYS.filter((s) => fin.keys.includes(s.k)) : ALL_KEYS;
  const reds = metrics.filter((m) => m.status === "red").length;
  const greens = metrics.filter((m) => m.status === "green").length;
  const overall = reds >= 2 ? "needs attention" : reds === 1 ? "mostly healthy" : "healthy";

  return (
    <>
      <Topbar title="Business Health" subtitle="I watch your numbers and tell you what needs fixing." />
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
                <p className="font-medium">{isReal && !hasMetrics ? "Let's get your real numbers in." : `Your business is ${overall}.`}</p>
                <Badge className="border-primary/30 text-primary">AI summary</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {isReal && !hasMetrics
                  ? "I don't have your numbers yet, so I won't guess. Upload a bank statement or GST return, or import a CSV, and I'll give you a real health read in seconds."
                  : isReal
                    ? `You're tracking ${metrics.length} metric${metrics.length === 1 ? "" : "s"} — ${reds} need attention and ${greens} healthy. Ask me anything and I'll answer from your real data.`
                    : "This is a live demo with sample data. Sign in and import your numbers to see your own business here."}
              </p>
              {isReal && !hasMetrics ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/bank" className="inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm hover:bg-accent"><Landmark className="h-4 w-4 text-primary" /> Upload bank statement</Link>
                  <Link href="/gst-reader" className="inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm hover:bg-accent"><ReceiptText className="h-4 w-4 text-primary" /> Read GST return</Link>
                  <Link href="/import" className="inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm hover:bg-accent"><UploadIcon className="h-4 w-4 text-primary" /> Import CSV / Excel</Link>
                </div>
              ) : (
                <Link href="/chat" className="inline-flex text-sm text-primary font-medium mt-2">Ask: “How is my business?” →</Link>
              )}
              <AIPulse />
            </div>
          </div>
        </Card>

        {/* Guided command layer: turns 120+ modules into the few that matter now. */}
        <NextBestActions />

        {isReal && (resolveIndustry((profile as any)?.industry)
          ? <IndustryPlaybook industry={(profile as any)?.industry} />
          : <IndustryPrompt />)}

        {hasMetrics && <Card className="p-5"><CortexScore metrics={metrics} /></Card>}

        {/* KPI grid */}
        {hasMetrics ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {metrics.map((m, i) => <KpiCard key={m.id} m={m} i={i} />)}
          </div>
        ) : isReal ? (
          /*
            "No business data yet" was shown for TWO different situations: the
            workspace genuinely has no rows, and the aggregation is failing (a
            missing service-role key being the usual cause). In the second case
            the customer had imported hundreds of rows, saw this message, and
            had no way to know the problem was ours. Now they are told apart.
          */
          recomputeFailure ? (
            <Card className="p-6 border-danger/30 bg-danger/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-danger mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-danger">Your data is saved, but Cortex could not calculate your KPIs</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                    This is a problem on our side, not with anything you entered — your rows are safe.
                    Nothing on this page is missing because of you.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    {recomputeFailure.reason}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Please contact support and quote that message. You can check live status on the{" "}
                    <Link href="/status" className="text-primary">status page</Link>.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center">
              <Landmark className="h-8 w-8 text-primary mx-auto" />
              <p className="mt-3 font-medium">No business data yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">Connect your real numbers and your whole dashboard, AI chat and reports come alive. It takes under a minute.</p>
            </Card>
          )
        ) : null}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Section title="Revenue, profit & cash" desc="Trailing 12 months (₹ Cr)">
              {chartData.length && chartKeys.length ? (
                <TrendChart data={chartData} keys={chartKeys} />
              ) : (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  No finance data yet. <Link href="/bank" className="text-primary">Upload a bank statement</Link> or <Link href="/import" className="text-primary">import your ledger</Link> to see your revenue, profit and cash trend.
                </Card>
              )}
            </Section>
          </div>

          {/* Alerts */}
          <Card>
            <div className="p-5 pb-2 font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Alerts</div>
            <div className="p-3 pt-1 space-y-2">
              {alerts.length ? alerts.map((a) => (
                <div key={a.id} className={cn("rounded-lg border p-3", statusBg[a.severity])}>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs opacity-80 mt-0.5">{a.body}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground px-2 py-3">No active alerts. Cortex raises them here once it's watching your data.</p>}
            </div>
          </Card>
        </div>

        {/* AI Insights & recommended actions */}
        {(insights.length > 0 || !isReal) && (
          <div>
            <h2 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Insights & recommended actions</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {insights.map((ins) => <InsightCard key={ins.id} ins={ins} />)}
            </div>
          </div>
        )}

        <InstallCTA />
      </PageShell>
    </>
  );
}
