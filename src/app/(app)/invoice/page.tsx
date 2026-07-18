import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { InvoiceGenerator } from "@/components/invoice-generator";

export const dynamic = "force-dynamic";

export default function Invoice() {
  return (
    <>
      <Topbar title="GST Invoice Generator" subtitle="Create a compliant tax invoice in seconds" />
      <PageShell>
        <InvoiceGenerator />
        <Section title="About this invoice" desc="India GST-ready">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Automatically splits tax into CGST + SGST for same-state (intra-state) supply, or IGST for inter-state — just toggle the checkbox. Add as many line items as you need, each with its own GST rate.</p>
            <p>Click <b>Preview & download PDF</b> to open a clean printable invoice; use your browser's "Save as PDF" to download or print it.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
