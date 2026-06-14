import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Workflow, Plus, Zap } from "lucide-react";

export const dynamic = "force-dynamic";
const flows = [
  { name: "Daily cash & receivables digest", trigger: "Schedule · 8:00 AM", steps: ["Pull ledger", "Flag overdue >30d", "Email owner"], active: true, last: "6h ago" },
  { name: "Auto reorder on stockout risk", trigger: "Event · cover < lead time", steps: ["Detect risk", "Draft PO", "Notify for approval"], active: true, last: "2h ago" },
  { name: "WhatsApp payment reminders", trigger: "Schedule · daily", steps: ["Find overdue", "Send WhatsApp", "Log response"], active: true, last: "1d ago" },
];
export default function Workflows() {
  return (
    <>
      <Topbar title="Workflow Automation" subtitle="The COO doesn’t just advise — it executes" />
      <PageShell>
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">3 active workflows · 142 actions executed this month</p>
          <Button><Plus className="h-4 w-4" /> New workflow</Button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {flows.map((f) => (
            <Card key={f.name} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" /><span className="font-medium text-sm">{f.name}</span></div>
                <Badge className={f.active ? "bg-success/10 text-success border-success/20" : "border-border"}>{f.active ? "Active" : "Paused"}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{f.trigger} · last run {f.last}</div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {f.steps.map((s, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="rounded-md bg-secondary px-2 py-1">{s}</span>{i < f.steps.length - 1 && <Zap className="h-3 w-3 text-muted-foreground" />}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </PageShell>
    </>
  );
}
