import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { GoalsTracker, type SavedGoal, type GoalMetricOption } from "@/components/goals-tracker";
import { getGoals, getMetrics, getUserAndOrg } from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** KPIs where a HIGHER number is worse. */
const LOWER_IS_BETTER = new Set(["receivables", "risk"]);

export default async function Goals() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);

  const { rows } = signedIn ? await getGoals() : { rows: [] as any[] };
  const metrics: GoalMetricOption[] = signedIn
    ? (await getMetrics()).map((m) => ({
        key: m.metric_key,
        label: m.label,
        value: Number(m.value) || 0,
        unit: m.unit === "INR" ? "" : (m.unit || ""),
        lowerBad: LOWER_IS_BETTER.has(m.metric_key),
      }))
    : [];

  return (
    <>
      <Topbar title="Goals & OKRs" subtitle="Set targets — Cortex tracks them against your own numbers" />
      <PageShell>
        {!signedIn ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary">Sign in</Link> to set goals for your workspace.
          </Card>
        ) : (
          <>
            {!metrics.length && (
              <Card className="p-4 text-sm text-muted-foreground">
                You can set goals now, but Cortex has no KPIs to measure them against yet —{" "}
                <Link href="/import" className="text-primary">import your data</Link> and linked goals will start
                tracking themselves.
              </Card>
            )}
            <GoalsTracker goals={rows as SavedGoal[]} metrics={metrics} />
          </>
        )}
        <Section title="How OKRs work in Cortex" desc="Objectives and Key Results, measured against your live KPIs">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Link a goal to one of your KPIs — margin, revenue, receivables, runway, attendance — and Cortex reads the current value from your own data every time you open this page. You never update it by hand, so it cannot quietly go stale.</p>
            <p>Goals with a green ring are on track; amber means at risk; red means off track and needing attention this week. For anything Cortex does not compute, you can still set a goal and track it yourself — it is labelled as such rather than pretending to be live.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
