import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { CollapsibleForm, Field, SelectField } from "@/components/forms";
import { ReportGenerator } from "@/components/report-generator";
import { getScheduledReports } from "@/lib/data";
import { addScheduledReport, deleteScheduledReport } from "@/lib/actions";
import { CalendarClock } from "lucide-react";

export const dynamic = "force-dynamic";

/** AI modes that make sense as a recurring report. */
const MODES = ["brief", "report", "actions", "risk", "costs", "forecast", "investor", "benchmark"];

export default async function Reports() {
  const sched = await getScheduledReports();

  return (
    <>
      <Topbar title="Reports" subtitle="Generate now, or have Cortex send it to you on a schedule" />
      <PageShell>
        <ReportGenerator />

        <Section
          title="Scheduled reports"
          desc="Cortex writes these from your live numbers and emails them automatically"
        >
          <CollapsibleForm title="Schedule a report" action={addScheduledReport}>
            <SelectField name="mode" label="Report" options={MODES} />
            <SelectField name="cadence" label="How often" options={["weekly", "daily", "monthly"]} />
            <Field name="send_to" label="Send to (blank = workspace owner)" placeholder="you@company.com" />
          </CollapsibleForm>

          <div className="space-y-2 mt-3">
            {sched.rows.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  <span className="capitalize font-medium">{r.cadence} {r.mode}</span>
                  <span className="text-muted-foreground text-xs">
                    → {r.send_to || "workspace owner"}
                    {r.last_sent ? ` · last sent ${new Date(r.last_sent).toLocaleDateString("en-IN")}` : " · not sent yet"}
                  </span>
                </div>
                <form action={deleteScheduledReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded-lg border h-8 px-3 text-xs text-danger hover:bg-danger/10">Remove</button>
                </form>
              </div>
            ))}
            {sched.rows.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">
                Nothing scheduled. A report only sends when the workspace has real KPIs — Cortex will never email an
                invented summary of an empty workspace.
              </Card>
            )}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
