import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { CapTable } from "@/components/cap-table";

export const dynamic = "force-dynamic";

export default function CapTablePage() {
  return (
    <>
      <Topbar title="Cap Table & Dilution" subtitle="See exactly what each round costs your ownership" />
      <PageShell>
        <CapTable />
        <Section title="The founder's dilution math" desc="What to watch">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Every priced round dilutes you by roughly raise ÷ post-money. Raising ₹2 Cr at ₹8 Cr pre-money (₹10 Cr post) sells ~20% — plus any ESOP top-up, which usually comes out of your slice, not the new investor's.</p>
            <p>Ownership % matters less than ownership × value. Going from 100% of a small company to 55% of a much larger one is the whole point — just make sure each round buys enough growth to justify the dilution.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
