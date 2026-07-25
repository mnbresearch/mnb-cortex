import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { DiscountImpact } from "@/components/discount-impact";

export const dynamic = "force-dynamic";

export default function Discount() {
  return (
    <>
      <Topbar title="Discount Impact" subtitle="Before you cut prices, see what it really costs" />
      <PageShell>
        <DiscountImpact />
        <Section title="The discount trap" desc="Why 10% off is bigger than it looks">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>A discount comes straight off your margin, not your price. If you keep 38% margin and give 10% off, you've given away more than a quarter of your profit per unit — so you need a lot more volume just to stand still.</p>
            <p>Before running a promotion, check the break-even volume here. If it's more than the promotion can realistically drive, offer added value (a free add-on, faster delivery) instead — it protects margin and feels just as generous.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
