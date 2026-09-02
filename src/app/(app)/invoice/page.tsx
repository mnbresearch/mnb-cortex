import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { InvoiceGenerator } from "@/components/invoice-generator";
import { listInvoices } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Invoice() {
  // Fetched server-side so the saved list reflects the WORKSPACE, on every
  // device, rather than whatever this browser happens to remember.
  const saved = await listInvoices();

  return (
    <>
      <Topbar title="GST Invoice Generator" subtitle="Raise a compliant tax invoice — and keep it" />
      <PageShell>
        <InvoiceGenerator saved={saved} />
        <Section title="About this invoice" desc="India GST-ready">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Automatically splits tax into CGST + SGST for same-state (intra-state) supply, or IGST for inter-state &mdash; just toggle the checkbox. Add as many line items as you need, each with its own GST rate.</p>
            <p><b>Preview &amp; download PDF</b> opens a clean printable invoice; use your browser&rsquo;s &ldquo;Save as PDF&rdquo;.</p>
            {/*
              Stated plainly because the difference is the entire point of the
              change: printing gives the customer a document, saving is what
              makes the rest of Cortex know the money is owed.
            */}
            <p><b>Save to workspace</b> is the one that matters. A saved invoice appears in Receivables, ages towards
            overdue on its due date, counts towards your DSO and cash conversion cycle, and feeds the 13-week cash
            forecast. Saving the same invoice number twice updates it rather than billing twice.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
