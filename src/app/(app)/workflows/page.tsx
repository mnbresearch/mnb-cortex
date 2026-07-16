import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollapsibleForm, Field, SelectField, DeleteButton } from "@/components/forms";
import { getWorkflowsList, getWorkflowRuns } from "@/lib/data";
import { addWorkflow, runWorkflow } from "@/lib/actions";
import { Workflow, Zap, Play } from "lucide-react";

export const dynamic = "force-dynamic";
const demo = [
  { id: "d1", name: "Daily cash & receivables digest", trigger: "schedule", steps: ["Pull ledger", "Flag overdue >30d", "Email owner"], is_active: true },
  { id: "d2", name: "Auto reorder on stockout risk", trigger: "event", steps: ["Detect risk", "Draft PO", "Notify for approval"], is_active: true },
  { id: "d3", name: "WhatsApp payment reminders", trigger: "schedule", steps: ["Find overdue", "Send WhatsApp", "Log response"], is_active: true },
];

export default async function Workflows() {
  const wf = await getWorkflowsList();
  const runs = await getWorkflowRuns();
  const list = wf.live ? wf.rows : demo;
  return (
    <>
      <Topbar title="Workflow Automation" subtitle="The COO doesn't just advise — it executes" />
      <PageShell>
        <p className="text-sm text-muted-foreground">{wf.live ? `${list.length} workflows` : "Demo workflows"} · {runs.live ? runs.rows.length : 142} runs logged</p>

        <CollapsibleForm title="New workflow" action={addWorkflow}>
          <Field name="name" label="Workflow name" required />
          <SelectField name="trigger" label="Trigger" options={["schedule","event","manual"]} />
          <Field name="steps" label="Steps (comma-separated)" placeholder="Pull data, Analyze, Notify" />
        </CollapsibleForm>

        <div className="grid md:grid-cols-2 gap-3">
          {list.map((f: any) => (
            <Card key={f.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" /><span className="font-medium text-sm">{f.name}</span></div>
                <Badge className={f.is_active ? "bg-success/10 text-success border-success/20" : "border-border"}>{f.is_active ? "Active" : "Paused"}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1 capitalize">{f.trigger}{f.last_run ? ` · last run ${String(f.last_run).slice(0,10)}` : ""}</div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {(f.steps || []).map((s: string, i: number) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="rounded-md bg-secondary px-2 py-1">{s}</span>{i < (f.steps.length - 1) && <Zap className="h-3 w-3 text-muted-foreground" />}
                  </span>
                ))}
              </div>
              {wf.live && (
                <div className="mt-3 flex items-center gap-2">
                  <form action={runWorkflow}>
                    <input type="hidden" name="id" value={f.id} /><input type="hidden" name="name" value={f.name} />
                    <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-8 px-3 text-xs font-medium hover:opacity-90"><Play className="h-3.5 w-3.5" /> Run now</button>
                  </form>
                  <DeleteButton table="workflows" id={f.id} path="/workflows" />
                </div>
              )}
            </Card>
          ))}
        </div>

        {runs.live && runs.rows.length > 0 && (
          <Section title="Recent runs">
            <div className="space-y-2">
              {runs.rows.slice(0, 8).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>{r.log}</span>
                  <Badge className="bg-success/10 text-success border-success/20">{r.status}</Badge>
                </div>
              ))}
            </div>
          </Section>
        )}
      </PageShell>
    </>
  );
}
