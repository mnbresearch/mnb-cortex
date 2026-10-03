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
              {/*
                THE PUBLIC PAGE WAS FIXED AND THIS ONE — THE PAID ONE — WAS NOT.

                src/app/ai-visibility/page.tsx carries a long note explaining
                that there is no OpenAI call and no Perplexity call anywhere in
                the feature: it queries Gemini. scripts/test-claims.mjs pins
                that page and does not scan the (app) route group, so the
                signed-in version kept naming three engines to the customers
                actually paying for it. "Over 100 million people" had no source
                in the repo either.
              */}
              Buyers increasingly ask an AI assistant for recommendations before they buy. Cortex runs your buyer questions
              through Google Gemini, shows whether <b>you</b> get named — or a competitor does — and drafts the exact content to get you recommended.
            </span>
          </div>
        </Card>
        <VisibilityPanel />
      </PageShell>
    </>
  );
}
