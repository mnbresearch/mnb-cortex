import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Telescope, Sparkles } from "lucide-react";
import { DeepDivePanel } from "@/components/deep-dive";

export const dynamic = "force-dynamic";

export default function DeepDive() {
  return (
    <>
      <Topbar title="Cortex Deep Dive" subtitle="A multi-pass AI analysis — diagnose, decide, then draft the first action" />
      <PageShell>
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-sm flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              Deep Dive doesn&rsquo;t just answer — it <b>reasons in three passes</b>: it diagnoses the situation and root cause,
              weighs three options and recommends one, then writes a 30-day plan and drafts the single highest-impact action for you to send or approve.
              Grounded in your live data and Cortex Memory.
            </span>
          </div>
        </Card>

        <DeepDivePanel />

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Telescope className="h-4 w-4 text-primary" />
            Tip: pick a focus area for a broad review, or type a sharp question for a targeted one. Each run costs 12 credits.
          </div>
        </Card>
      </PageShell>
    </>
  );
}
