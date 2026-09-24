import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { DecisionJournal } from "@/components/decision-journal";
import { listWorkbench, canSaveWorkbench } from "@/lib/workbench";
import type { DecisionData } from "@/lib/workbench-types";

export const dynamic = "force-dynamic";

export default async function Decisions() {
  const [entries, canSave] = await Promise.all([
    listWorkbench<DecisionData>("decision"),
    canSaveWorkbench(),
  ]);
  return (
    <>
      <Topbar title="Decision Journal" subtitle="Write the call down — then let the AI argue against it" />
      <PageShell>
        <DecisionJournal entries={entries} canSave={canSave} />
        <Section title="Why keep a decision journal" desc="The founder's most underrated habit">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Recording a decision with the reasoning behind it does two things: it forces you to make your assumptions explicit, and it lets you honestly review later whether the outcome came from a good decision or just luck.</p>
            <p>The <b>Devil&apos;s Advocate</b> steelmans your call, then names the risks you&apos;re most likely underweighting and the cheaper, reversible alternatives — the pushback a good co-founder would give before you commit.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
