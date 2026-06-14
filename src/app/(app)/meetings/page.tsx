import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, CheckSquare } from "lucide-react";

export const dynamic = "force-dynamic";
const actions = [
  { owner: "Procurement", task: "Approve PO-4471 for RM-204", due: "Tomorrow" },
  { owner: "Sales", task: "Send UAE pilot proposal to Gulf Imports", due: "Friday" },
  { owner: "Finance", task: "Chase Apex Traders ₹18 L overdue", due: "This week" },
];
export default function Meetings() {
  return (
    <>
      <Topbar title="Meeting Assistant" subtitle="Google Meet · Zoom · Microsoft Teams" />
      <PageShell>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline"><Video className="h-4 w-4" /> Connect Google Meet</Button>
          <Button variant="outline"><Video className="h-4 w-4" /> Connect Zoom</Button>
          <Button variant="outline"><Video className="h-4 w-4" /> Connect Teams</Button>
        </div>
        <Section title="Weekly Ops Review" desc="2 days ago · auto-transcribed" right={<Badge className="border-success/30 text-success">MOM ready</Badge>}>
          <p className="text-sm text-muted-foreground">Reviewed Line B stockout risk and agreed to approve the RM-204 PO and add a backup supplier. Sales confirmed Premium-X ramp; agreed to send the UAE pilot proposal. Finance to escalate overdue receivables.</p>
          <div className="mt-4">
            <div className="font-medium text-sm mb-2 flex items-center gap-2"><CheckSquare className="h-4 w-4 text-primary" /> Action items (auto-assigned)</div>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div><b>{a.owner}</b> — {a.task}</div>
                  <Badge className="border-border text-muted-foreground">{a.due}</Badge>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
