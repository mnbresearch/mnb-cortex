import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getActivity } from "@/lib/data";
import { Sparkles, CheckCircle2, Upload, Workflow, Database, Activity as Act } from "lucide-react";

export const dynamic = "force-dynamic";
const ICON: Record<string, any> = { ai: Sparkles, approval: CheckCircle2, import: Upload, workflow: Workflow, crud: Database, data: Act };
export default async function ActivityPage() {
  const { rows, live } = await getActivity();
  return (
    <>
      <Topbar title="Activity" subtitle="Everything your AI COO and team have done" />
      <PageShell>
        {!live && <Card className="p-5 bg-warning/10 border-warning/20 text-sm"><a href="/login" className="text-primary underline">Sign in</a> to see your workspace activity timeline.</Card>}
        {live && (
          <Card className="p-5">
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet. Run an AI action, approval, or import and it'll show here.</p> : (
              <ol className="relative border-l ml-2 space-y-5">
                {rows.map((a) => { const Icon = ICON[a.type] || Act; return (
                  <li key={a.id} className="ml-5">
                    <span className="absolute -left-3 grid place-items-center h-6 w-6 rounded-full bg-primary/15 border"><Icon className="h-3 w-3 text-primary" /></span>
                    <div className="flex items-center gap-2"><span className="text-sm">{a.message}</span><Badge className="border-border text-muted-foreground capitalize text-[10px]">{a.type}</Badge></div>
                    <div className="text-xs text-muted-foreground mt-0.5">{String(a.created_at).slice(0, 16).replace("T", " ")}</div>
                  </li>
                ); })}
              </ol>
            )}
          </Card>
        )}
      </PageShell>
    </>
  );
}
