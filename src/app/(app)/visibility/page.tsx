import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Radar } from "lucide-react";
import { VisibilityPanel } from "@/components/visibility";

export const dynamic = "force-dynamic";

export default function Visibility() {
  return (
    <>
      <Topbar title="AI Visibility" subtitle="Are you recommended when buyers ask AI? Find out — and fix it." />
      <PageShell>
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-sm flex items-start gap-2">
            <Radar className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              Over 100 million people now ask AI (ChatGPT, Gemini, Perplexity) for recommendations before they buy. Cortex runs your buyer questions
              through live AI engines, shows whether <b>you</b> get named — or a competitor does — and drafts the exact content to get you recommended.
            </span>
          </div>
        </Card>
        <VisibilityPanel />
      </PageShell>
    </>
  );
}
