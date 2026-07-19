import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { ProjectProfitability } from "@/components/project-profitability";

export const dynamic = "force-dynamic";

export default function Projects() {
  return (
    <>
      <Topbar title="Project & Client Profitability" subtitle="Find the engagements quietly losing you money" />
      <PageShell>
        <ProjectProfitability />
        <Section title="Why effective rate matters more than fee" desc="The consulting margin trap">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>A ₹3.2 L project sounds better than a ₹1.8 L one — until you count the hours. Effective rate (fee ÷ hours actually delivered) is the honest number, and it's usually the big "prestige" projects that drag it down.</p>
            <p>Retainers with unbounded scope are the most common leak: the fee is fixed, the hours are not. Track hours per client for one month and the picture usually changes.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
