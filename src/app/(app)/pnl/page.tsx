import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { PnlBuilder } from "@/components/pnl-builder";

export const dynamic = "force-dynamic";

export default function Pnl() {
  return (
    <>
      <Topbar title="P&L Builder" subtitle="Build your income statement and see where the money goes" />
      <PageShell>
        <PnlBuilder />
        <Section title="Reading your P&L" desc="The three margins that matter">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><b>Gross margin</b> tells you if your core product makes money before overheads. <b>EBITDA margin</b> tells you if the business as a whole is efficient. <b>Net margin</b> is what you actually keep.</p>
            <p>If gross margin is healthy but EBITDA is thin, your problem is overheads, not pricing. If gross margin itself is low, fix pricing or input costs first — no amount of overhead-cutting rescues a broken unit economic.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
