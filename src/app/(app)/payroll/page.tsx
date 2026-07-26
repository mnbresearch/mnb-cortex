import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { PayrollCalc } from "@/components/payroll-calc";

export const dynamic = "force-dynamic";

export default function Payroll() {
  return (
    <>
      <Topbar title="Payroll & CTC" subtitle="Turn a CTC into real take-home before you make an offer" />
      <PageShell>
        <PayrollCalc />
        <Section title="Why CTC ≠ take-home" desc="The gap that surprises new hires">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>CTC includes employer PF, gratuity provisions and allowances the employee never sees in their bank. A ₹12 L CTC often lands around ₹80–90k/month in hand, not ₹1 L — set expectations at offer time to avoid awkward first paydays.</p>
            <p>For most salaries under ₹12 L, the new tax regime now wins for employees who don't have large 80C investments. Use the toggle to compare.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
