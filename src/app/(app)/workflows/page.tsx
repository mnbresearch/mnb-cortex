import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollapsibleForm, Field, SelectField, DeleteButton } from "@/components/forms";
import { getWorkflowsList, getWorkflowRuns } from "@/lib/data";
import { addWorkflow, runWorkflow } from "@/lib/actions";
import { Workflow, Zap, Play } from "lucide-react";
import { ACTIONS } from "@/lib/workflows";

export const dynamic = "force-dynamic";
// Example workflows written in the real step language, so what a visitor sees
// is exactly what they can run. The old demo used prose ("Pull ledger") that
// the executor has no way to interpret.
const demo = [
  { id: "d1", name: "Daily cash & receivables digest", trigger: "schedule", steps: ["recompute", "receivables", "email Your daily cash digest"], is_active: true },
  { id: "d2", name: "Stockout watch", trigger: "schedule", steps: ["reorder", "alert Items are below reorder level"], is_active: true },
  { id: "d3", name: "Monday priorities", trigger: "schedule", steps: ["recompute", "ai actions", "email Your plan for the week"], is_active: true },
];

export default async function Workflows() {
  const wf = await getWorkflowsList();
  const runs = await getWorkflowRuns();
  const list = wf.live ? wf.rows : demo;
  return (
    <>
      <Topbar title="Workflow Automation" subtitle="The COO doesn't just advise — it executes" />
      <PageShell>
        <p className="text-sm text-muted-foreground">{wf.live ? `${list.length} workflows` : "Demo workflows"} · {runs.live ? runs.rows.length : 0} runs logged</p>

        <Card className="p-4">
          <div className="text-sm font-medium">What a step can do</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Start each step with one of these words. Steps run in order, and the run log tells you exactly what each one did.
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-1.5">
            {ACTIONS.map((a) => (
              <div key={a.verb} className="text-xs flex gap-2">
                <code className="rounded bg-secondary px-1.5 py-0.5 shrink-0 h-fit">{a.verb}{a.arg ? " " + a.arg : ""}</code>
                <span className="text-muted-foreground">{a.does}</span>
              </div>
            ))}
          </div>
        </Card>

        <CollapsibleForm title="New workflow" action={addWorkflow}>
          <Field name="name" label="Workflow name" required />
          <SelectField name="trigger" label="Trigger" options={["schedule","event","manual"]} />
          <Field name="steps" label="Steps (comma-separated)" placeholder="recompute, receivables, email Daily digest" />
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
                <div key={r.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed flex-1">{r.log}</pre>
                    <Badge className={r.status === "success" ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20"}>{r.status}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">{r.ran_at ? new Date(r.ran_at).toLocaleString("en-IN") : ""}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </PageShell>
    </>
  );
}
