import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { ReceiptText, ShieldCheck } from "lucide-react";
import { GstReturnPanel } from "@/components/gst-return";

export const dynamic = "force-dynamic";

export default function GstReader() {
  return (
    <>
      <Topbar title="GST Return Reader" subtitle="Upload a GST return and read your real tax position in seconds." />
      <PageShell>
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-sm flex items-start gap-2">
            <ReceiptText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              Upload a GSTR-3B, GSTR-1 or 2B (CSV or PDF) and Cortex extracts your taxable turnover, the IGST/CGST/SGST split, ITC available and your net GST payable —
              then flags anything worth watching. Save it to <b>Cortex Memory</b> so your AI answers know your real tax numbers.
            </span>
          </div>
        </Card>
        <GstReturnPanel />
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            {/* This used to promise on-device reading and no server storage — untrue: the text goes to /api/gst/analyze and
                our AI provider, and persistGstAnalysis writes turnover and tax to the finance ledger. */}
            Your file is opened in your browser, then its text is sent to our AI provider for analysis. The filed turnover and tax
            for the return period are saved to your workspace automatically; saving the summary to Memory is optional. Not a
            substitute for your CA; always verify before filing.
          </div>
        </Card>
      </PageShell>
    </>
  );
}
