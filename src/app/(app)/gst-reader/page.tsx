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
            Read on your device and analysed on the fly — nothing stored on our servers unless you save the summary. Not a substitute for your CA; always verify before filing.
          </div>
        </Card>
      </PageShell>
    </>
  );
}
