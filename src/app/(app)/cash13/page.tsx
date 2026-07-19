import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Cash13 } from "@/components/cash13";

export const dynamic = "force-dynamic";

export default function Cash13Page() {
  return (
    <>
      <Topbar title="13-Week Cash Flow" subtitle="See the crunch coming while you can still act" />
      <PageShell>
        <Cash13 />
        <Section title="How to use this weekly" desc="The discipline that saves businesses">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Thirteen weeks is one quarter — far enough to see trouble, close enough to forecast honestly. Update it every Monday: roll the window forward, put in what you actually expect to receive and pay.</p>
            <p>Watch the <b>lowest point</b>, not the closing balance. A business that ends the quarter healthy can still fail in week 6 if it runs out mid-way.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
