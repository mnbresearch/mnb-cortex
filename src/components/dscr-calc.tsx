"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function DscrCalc() {
  const [noi, setNoi] = useState(3_600_000);      // annual net operating income (EBITDA-ish)
  const [existingDebt, setExistingDebt] = useState(1_200_000); // annual existing debt service
  const [rate, setRate] = useState(12);
  const [tenure, setTenure] = useState(7);
  const [minDscr, setMinDscr] = useState(1.25);

  const m = useMemo(() => {
    // Income available for NEW debt after keeping min DSCR on total
    const maxTotalService = noi / minDscr;
    const availForNew = Math.max(maxTotalService - existingDebt, 0);
    // Convert annual capacity into a loan principal (standard EMI/annuity)
    const r = rate / 100 / 12;
    const n = tenure * 12;
    const monthlyCapacity = availForNew / 12;
    const eligible = r === 0 ? monthlyCapacity * n : monthlyCapacity * (1 - Math.pow(1 + r, -n)) / r;
    const currentDscr = existingDebt > 0 ? noi / existingDebt : Infinity;
    return { availForNew, eligible: Math.max(eligible, 0), currentDscr, monthlyCapacity };
  }, [noi, existingDebt, rate, tenure, minDscr]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {F("Annual operating income (EBITDA)", noi, setNoi)}
          {F("Existing annual debt service", existingDebt, setExistingDebt)}
          {F("New loan rate", rate, setRate, "%")}
          {F("New loan tenure", tenure, setTenure, "yrs")}
          {F("Lender min DSCR", minDscr, setMinDscr, "×")}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Current DSCR" value={m.currentDscr === Infinity ? "∞" : `${m.currentDscr.toFixed(2)}×`} cls={m.currentDscr >= minDscr ? "text-success" : "text-danger"} />
          <Stat label="Room for new EMI / mo" value={inr(m.monthlyCapacity)} />
          <Stat label="Est. loan you'd qualify for" value={inr(m.eligible)} highlight />
        </div>
      </Card>
      <Card className="p-5 text-sm">
        <div className="font-semibold mb-1">How lenders read this</div>
        <p className="text-muted-foreground">
          DSCR = operating income ÷ debt repayments. Most banks want <b>{minDscr}×</b> or higher — i.e. you earn ₹{minDscr.toFixed(2)} for every ₹1 of loan payments.
          At your numbers you have about {inr(m.monthlyCapacity)}/month of spare servicing capacity, which supports roughly <b>{inr(m.eligible)}</b> of new borrowing at {rate}% over {tenure} years.
          This is an estimate — actual eligibility also depends on collateral, credit history, and the lender's policy.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
