import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const agenda = ["Executive summary", "Financials & cash", "Growth & pipeline", "Risks & mitigations", "Operations", "Asks & decisions", "Next quarter"];

export default function Boardroom() {
  return (
    <>
      <Topbar title="Board Deck Generator" subtitle="A full board deck, drafted from your live numbers" />
      <PageShell>
        <Section title="Generate the deck" desc="Slide-by-slide, board-ready, honest and quantified">
          <AIPanel inputOptional mode="board" placeholder="Optional: add context (a fundraise, a big decision to table, a specific ask)" cta="Draft the board deck" multiline saveMode="strategy" />
          <p className="text-xs text-muted-foreground mt-2">Save it to your workspace. To present it as a PDF, use your browser&rsquo;s Print → Save as PDF while the result is on screen.</p>
        </Section>
        <Section title="Standard agenda" desc="What the deck will cover">
          <div className="flex flex-wrap gap-2">{agenda.map((a, i) => <Card key={a} className="px-3 py-2 text-sm text-muted-foreground">{i + 1}. {a}</Card>)}</div>
        </Section>
      </PageShell>
    </>
  );
}
