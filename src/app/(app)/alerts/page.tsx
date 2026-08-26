import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AlertRules, type LiveMetric, type SavedRule } from "@/components/alert-rules";
import { getMetrics, getAlertRules, getAlerts } from "@/lib/data";
import { dismissAlert } from "@/lib/actions";
import { AlertTriangle } from "lucide-react";
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

  const { rows: ruleRows } = await getAlertRules();
  const rules: SavedRule[] = ruleRows.map((r: any) => ({
    id: String(r.id), metric_key: String(r.metric_key),
    op: r.op === ">" ? ">" : "<", threshold: Number(r.threshold) || 0,
  }));

  // This page carried the title "Get warned the moment a number crosses your
  // line" and never once read the alerts table. Alerts raised by the autopilot,
  // by reminders, and now by these rules were written and never shown here.
  const fired = await getAlerts();

  return (
    <>
      <Topbar title="KPI Alerts" subtitle="Get warned the moment a number crosses your line" />
      <PageShell>
        {fired.length > 0 && (
          <Section title="Open alerts" desc="Raised automatically — dismiss one when you have dealt with it">
            <div className="space-y-2">
              {fired.map((a: any) => (
                <Card key={a.id} className={`p-4 flex items-start gap-3 ${a.severity === "red" ? "border-danger/30 bg-danger/5" : "border-warning/30 bg-warning/5"}`}>
                  <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${a.severity === "red" ? "text-danger" : "text-warning"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{a.title}</div>
                    {a.body && <div className="text-sm text-muted-foreground mt-0.5">{a.body}</div>}
                  </div>
                  <form action={dismissAlert}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">Dismiss</button>
                  </form>
                </Card>
              ))}
            </div>
          </Section>
        )}

        {metrics.length ? <AlertRules metrics={metrics} rules={rules} /> : (
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
