import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AlertRules } from "@/components/alert-rules";

export const dynamic = "force-dynamic";

export default function Alerts() {
  return (
    <>
      <Topbar title="KPI Alerts" subtitle="Get warned the moment a number crosses your line" />
      <PageShell>
        <AlertRules />
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
