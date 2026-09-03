import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Landmark, ShieldCheck } from "lucide-react";
import { BankStatementPanel } from "@/components/bank-statement";

export const dynamic = "force-dynamic";

export default function Bank() {
  return (
    <>
      <Topbar title="Bank Statement Intelligence" subtitle="Turn a raw statement into your real cash truth — in seconds." />
      <PageShell>
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-sm flex items-start gap-2">
            <Landmark className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              Upload a bank statement (CSV or PDF) and Cortex reads every transaction — categorises your spend, shows exactly where the money went,
              and computes your real money‑in, money‑out and net cash flow. Save it to <b>Cortex Memory</b> and Ask Cortex, Deep Dive and your weekly brief all start using your real numbers.
            </span>
          </div>
        </Card>
        <BankStatementPanel />
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            The file is read in your browser and analysed on the fly — nothing is stored on our servers unless you choose to save the summary to Memory.
          </div>
        </Card>
      </PageShell>
    </>
  );
}
