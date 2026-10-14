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
            {/* This used to promise browser-only reading and no server storage. Neither was true: the statement text is sent
                to /api/bank/analyze and on to our AI provider, and persistBankAnalysis always writes the monthly figures to the
                workspace's finance ledger. */}
            Your file is opened in your browser, then its text is sent to our AI provider for analysis. The monthly cash totals
            (money in minus money out, and the closing balance) are saved to your workspace automatically so the dashboard and
            runway can use them. Saving the written summary to Memory is a separate, optional step.
          </div>
        </Card>
      </PageShell>
    </>
  );
}
