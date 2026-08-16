import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AlertRules, type LiveMetric } from "@/components/alert-rules";
import { getMetrics } from "@/lib/data";
import { Card } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** KPIs where a HIGHER number is worse. */
const LOWER_IS_BETTER = new Set(["receivables", "risk"]);

export default async function Alerts() {
  // Rules are evaluated against this workspace's own KPIs — never a fixture.
  const metrics: LiveMetric[] = (await getMetrics()).map((m) => ({
    key: m.metric_key, label: m.label, value: Number(m.value) || 0,
    unit: m.unit === "INR" ? "" : (m.unit || ""),
    lowerBad: LOWER_IS_BETTER.has(m.metric_key),
  }));

  return (
    <>
      <Topbar title="KPI Alerts" subtitle="Get warned the moment a number crosses your line" />
      <PageShell>
        {metrics.length ? <AlertRules metrics={metrics} /> : (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No live KPIs to watch yet. <Link href="/import" className="text-primary">Import your data</Link> or{" "}
            <Link href="/bank" className="text-primary">upload a bank statement</Link>, and your metrics will appear here to set rules against.
          </Card>
        )}
        <Section title="Why threshold alerts beat dashboards" desc="Attention, not information">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>A dashboard shows you everything, all the time — which means you notice nothing until it's a crisis. A rule fires only when a number crosses a line you care about, so your attention goes exactly where it's needed.</p>
            <p>Good starting rules: cash runway below 6 months, gross margin below target, overdue receivables above a ceiling, and inventory cover below lead time.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
