import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const ideas = ["New customer onboarding", "Monthly GST filing", "Purchase order approval", "Inventory reorder", "Employee onboarding", "Handling a customer complaint"];

export default function Sops() {
  return (
    <>
      <Topbar title="SOP Builder" subtitle="Turn how-you-do-things into repeatable processes" />
      <PageShell>
        {/*
          THE IDEAS MOVED INTO THE PANEL, because that is the only place they
          could ever have worked.

          They were a separate Section of <Badge> chips under the words "Tap
          one, paste it above, and generate". Badge renders a plain <span>: no
          onClick, no clipboard, no keyboard affordance. So the instruction was
          false, and the user's actual options were to retype the sentence or
          select it with a mouse and copy it by hand.

          Passing them to AIPanel makes them buttons that fill the field, which
          is what "tap one" always implied. The second Section is gone rather
          than reworded — it existed only to hold chips that now live where the
          input is.
        */}
        <Section title="Write an SOP" desc="Describe the process — Cortex writes a clear, team-ready procedure">
          <AIPanel
            mode="sop"
            placeholder="e.g. How we approve and raise a purchase order for raw materials"
            aria-label="Describe the process to turn into an SOP"
            cta="Generate the SOP"
            multiline
            saveMode="strategy"
            suggestions={ideas}
          />
        </Section>
      </PageShell>
    </>
  );
}
