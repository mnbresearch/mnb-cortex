"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  calculateTredsArbitrage,
  DEFAULT_TREDS_RATE_PCT,
  DEFAULT_ALT_SME_BORROWING_RATE_PCT,
} from "@/lib/treds-calculator";
import { inr } from "@/lib/utils";
import { Zap, ShieldCheck, ArrowRight, Building2 } from "lucide-react";

export function TredsArbitrageCard({ defaultAmount = 2500000 }: { defaultAmount?: number }) {
  const [invoiceAmount, setInvoiceAmount] = useState(defaultAmount);
  const [termDays, setTermDays] = useState(90);
  const [tredsRate, setTredsRate] = useState(DEFAULT_TREDS_RATE_PCT);
  const [altRate, setAltRate] = useState(DEFAULT_ALT_SME_BORROWING_RATE_PCT);

  const result = useMemo(() => {
    return calculateTredsArbitrage({
      invoiceAmount,
      paymentTermDays: termDays,
      tredsDiscountRatePct: tredsRate,
      alternativeBorrowingRatePct: altRate,
    });
  }, [invoiceAmount, termDays, tredsRate, altRate]);

  return (
    <Card className="p-5 sm:p-6 space-y-5 border-primary/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
              <Zap className="h-3.5 w-3.5" /> RBI TReDS Institutional Factoring
            </span>
            <span className="rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Without Recourse
            </span>
          </div>
          <h3 className="mt-1 font-semibold text-foreground text-base sm:text-lg">
            Institutional Receivables Auction & 48-Hour Cash Release
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Auction verified corporate invoices on RBI-regulated TReDS exchanges (RXIL, Invoicemart, M1xchange) to unlock instant working capital at corporate bank rates.
          </p>
        </div>
      </div>

      {/* Input Sliders & Controls */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Invoice Value (₹)</label>
          <input
            type="number"
            value={invoiceAmount}
            onChange={(e) => setInvoiceAmount(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Customer Credit Period</label>
          <select
            value={termDays}
            onChange={(e) => setTermDays(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={30}>30 Days Terms</option>
            <option value={45}>45 Days (MSME Cap)</option>
            <option value={60}>60 Days Terms</option>
            <option value={90}>90 Days Terms</option>
            <option value={120}>120 Days Terms</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">TReDS Bank Bid Rate (% p.a.)</label>
          <input
            type="number"
            step="0.25"
            value={tredsRate}
            onChange={(e) => setTredsRate(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs tabular-nums outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Alternative SME Borrowing Rate</label>
          <input
            type="number"
            step="0.5"
            value={altRate}
            onChange={(e) => setAltRate(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs tabular-nums outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Financial Comparison Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3.5">
          <div className="text-xs font-medium text-primary">Immediate Cash Disbursed</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-primary tabular-nums">
            {inr(result.immediateCashDisbursed)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Within 48–72 hours in bank</div>
        </div>
        <div className="rounded-lg border p-3.5 bg-card">
          <div className="text-xs text-muted-foreground font-medium">TReDS Total Discount Fee</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-foreground tabular-nums">
            {inr(result.totalTredsDeduction)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">At {result.tredsAnnualRatePct}% p.a. corporate rate</div>
        </div>
        <div className="rounded-lg border border-success/40 bg-success/5 p-3.5">
          <div className="text-xs font-medium text-success">Net Interest Arbitrage Saved</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-success tabular-nums">
            {inr(result.netInterestSaved)}
          </div>
          <div className="mt-0.5 text-[11px] text-success">Saved vs standard SME credit</div>
        </div>
        <div className="rounded-lg border p-3.5 bg-card">
          <div className="text-xs text-muted-foreground font-medium">Turnaround vs Credit Period</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-foreground">
            2 Days <span className="text-xs font-normal text-muted-foreground">vs {termDays}d</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Accelerates cash conversion</div>
        </div>
      </div>

      {/* Institutional Exchange Tags */}
      <div className="rounded-lg border bg-muted/30 p-3.5 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <span>RBI-Authorized TReDS Platforms: RXIL (SIDBI/NSE), Invoicemart (Axis Bank), M1xchange.</span>
        </div>
        <div className="text-[11px] text-foreground font-medium flex items-center gap-1">
          100% Non-Recourse to Seller <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </Card>
  );
}
