"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function PrepayInvest() {
  const [surplus, setSurplus] = useState(500000);   // lump sum available
  const [loanRate, setLoanRate] = useState(11);      // loan interest %
  const [years, setYears] = useState(5);             // horizon
  const [investReturn, setInvestReturn] = useState(12); // expected return %
  const [taxOnGains, setTaxOnGains] = useState(12.5);   // LTCG %

  const m = useMemo(() => {
    // Prepay: you "earn" the loan rate, tax-free (interest you don't pay).
    const prepayValue = surplus * Math.pow(1 + loanRate / 100, years);
    const interestSaved = prepayValue - surplus;
    // Invest: grows at return, minus tax on the gains.
    const grossInvest = surplus * Math.pow(1 + investReturn / 100, years);
    const gain = grossInvest - surplus;
    const netInvest = surplus + gain * (1 - taxOnGains / 100);
    const investNetGain = netInvest - surplus;
    const better = prepayValue >= netInvest ? "Prepay the loan" : "Invest the surplus";
    const diff = Math.abs(prepayValue - netInvest);
    return { prepayValue, interestSaved, netInvest, investNetGain, better, diff };
  }, [surplus, loanRate, years, investReturn, taxOnGains]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {F("Surplus cash available", surplus, setSurplus)}
          {F("Loan interest rate", loanRate, setLoanRate, "%")}
          {F("Horizon", years, setYears, "yrs")}
          {F("Expected investment return", investReturn, setInvestReturn, "%")}
          {F("Tax on investment gains", taxOnGains, setTaxOnGains, "%")}
        </div>
      </Card>
      <div className="grid sm:grid-cols-2 gap-3">
        <Card className={`p-5 ${m.better.startsWith("Prepay") ? "border-primary/40 bg-primary/5" : ""}`}>
          <div className="text-sm text-muted-foreground">Prepay the loan</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{inr(m.prepayValue)}</div>
          <div className="text-xs text-muted-foreground mt-1">Interest saved (tax-free): {inr(m.interestSaved)}</div>
        </Card>
        <Card className={`p-5 ${m.better.startsWith("Invest") ? "border-primary/40 bg-primary/5" : ""}`}>
          <div className="text-sm text-muted-foreground">Invest the surplus</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{inr(m.netInvest)}</div>
          <div className="text-xs text-muted-foreground mt-1">Net gain after tax: {inr(m.investNetGain)}</div>
        </Card>
      </div>
      <Card className="p-5 text-sm">
        <b className="text-primary">{m.better}</b> comes out ahead by <b>{inr(m.diff)}</b> over {years} years.
        <span className="text-muted-foreground"> Prepaying earns a guaranteed, tax-free return equal to your loan rate; investing can beat it but carries risk and tax. If the numbers are close, prepaying is the safer choice — and clears the debt off your books.</span>
      </Card>
    </div>
  );
}
