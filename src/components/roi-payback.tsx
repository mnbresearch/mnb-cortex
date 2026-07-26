"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function RoiPayback() {
  const [invest, setInvest] = useState(1_000_000);
  const [monthlyReturn, setMonthlyReturn] = useState(80_000);
  const [months, setMonths] = useState(24);
  const [discount, setDiscount] = useState(15); // annual %

  const m = useMemo(() => {
    const totalReturn = monthlyReturn * months;
    const netProfit = totalReturn - invest;
    const roi = invest > 0 ? (netProfit / invest) * 100 : 0;
    const paybackMonths = monthlyReturn > 0 ? invest / monthlyReturn : Infinity;
    const annualisedRoi = months > 0 ? roi / (months / 12) : 0;
    // NPV of the monthly stream
    const r = discount / 100 / 12;
    let npv = -invest;
    for (let i = 1; i <= months; i++) npv += monthlyReturn / Math.pow(1 + r, i);
    return { totalReturn, netProfit, roi, paybackMonths, annualisedRoi, npv };
  }, [invest, monthlyReturn, months, discount]);

  const F = (label: string, value: number, set: (n: number) => void, suffix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring">
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /><span className="text-xs text-muted-foreground">{suffix}</span>
      </div></label>
  );

  return (
    <Card className="p-5 space-y-5">
      <div><div className="font-semibold">Investment payback & ROI</div><div className="text-sm text-muted-foreground">For any purchase — a machine, a hire, a marketing bet.</div></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {F("Upfront investment", invest, setInvest)}
        {F("Return / month", monthlyReturn, setMonthlyReturn)}
        {F("Over (months)", months, setMonths, "mo")}
        {F("Discount rate (annual)", discount, setDiscount, "%")}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Payback period" value={m.paybackMonths === Infinity ? "never" : `${m.paybackMonths.toFixed(1)} mo`} cls={m.paybackMonths <= 12 ? "text-success" : m.paybackMonths <= 24 ? "text-warning" : "text-danger"} />
        <Stat label="Net profit" value={inr(m.netProfit)} cls={m.netProfit >= 0 ? "text-success" : "text-danger"} />
        <Stat label="ROI" value={`${m.roi.toFixed(0)}%`} sub={`${m.annualisedRoi.toFixed(0)}%/yr`} />
        <Stat label="NPV" value={inr(m.npv)} cls={m.npv >= 0 ? "text-success" : "text-danger"} sub="today's money" />
      </div>
      <div className={`rounded-lg border p-4 text-sm ${m.npv >= 0 ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
        {m.npv >= 0
          ? <span className="text-success">Worth it: even after discounting future returns at {discount}%, this creates <b>{inr(m.npv)}</b> of value today, paying back in <b>{m.paybackMonths.toFixed(1)} months</b>.</span>
          : <span className="text-danger">Careful: discounted at {discount}%, the returns don't cover the investment — NPV is negative. Only proceed if there's strategic value beyond the cash.</span>}
      </div>
    </Card>
  );
}

function Stat({ label, value, sub, cls = "" }: { label: string; value: string; sub?: string; cls?: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>;
}
