"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

function slabTax(income: number, slabs: [number, number][]): number {
  let tax = 0, prev = 0;
  for (const [limit, rate] of slabs) {
    if (income > prev) { tax += (Math.min(income, limit) - prev) * rate; prev = limit; }
  }
  return tax;
}

const NEW_SLABS: [number, number][] = [[300000, 0], [700000, 0.05], [1000000, 0.10], [1200000, 0.15], [1500000, 0.20], [Infinity, 0.30]];
const OLD_SLABS: [number, number][] = [[250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]];

export function TaxEstimator() {
  const [income, setIncome] = useState(1_500_000);
  const [regime, setRegime] = useState<"new" | "old">("new");
  const [salaried, setSalaried] = useState(true);
  const [ded80c, setDed80c] = useState(150000);
  const [otherDed, setOtherDed] = useState(0);

  const m = useMemo(() => {
    const std = salaried ? 50000 : 0;
    let taxable: number, tax: number;
    if (regime === "new") {
      taxable = Math.max(0, income - std);
      tax = slabTax(taxable, NEW_SLABS);
      if (taxable <= 700000) tax = 0; // 87A rebate
    } else {
      taxable = Math.max(0, income - std - Math.min(ded80c, 150000) - otherDed);
      tax = slabTax(taxable, OLD_SLABS);
      if (taxable <= 500000) tax = 0; // 87A rebate
    }
    const cess = tax * 0.04;
    const total = tax + cess;
    const effective = income ? (total / income) * 100 : 0;
    const takeHome = income - total;
    // Advance tax (15/45/75/100%)
    const adv = [0.15, 0.30, 0.30, 0.25].map((p) => total * p);
    return { taxable, tax, cess, total, effective, takeHome, adv };
  }, [income, regime, salaried, ded80c, otherDed]);

  // Compare regimes
  const compare = useMemo(() => {
    const std = salaried ? 50000 : 0;
    const nt = (() => { const tx = Math.max(0, income - std); let t = slabTax(tx, NEW_SLABS); if (tx <= 700000) t = 0; return t * 1.04; })();
    const ot = (() => { const tx = Math.max(0, income - std - Math.min(ded80c, 150000) - otherDed); let t = slabTax(tx, OLD_SLABS); if (tx <= 500000) t = 0; return t * 1.04; })();
    return { nt, ot, better: nt <= ot ? "New" : "Old", save: Math.abs(nt - ot) };
  }, [income, salaried, ded80c, otherDed]);

  const F = (label: string, value: number, set: (n: number) => void) => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">₹</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 space-y-3">
        <div className="font-semibold">Your income</div>
        {F("Annual income", income, setIncome)}
        <div className="flex flex-wrap gap-3">
          <label className="text-sm"><span className="text-muted-foreground block mb-1">Regime</span>
            <select value={regime} onChange={(e) => setRegime(e.target.value as any)} className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="new">New</option><option value="old">Old</option></select></label>
          <label className="text-sm flex items-center gap-2 mt-6"><input type="checkbox" checked={salaried} onChange={(e) => setSalaried(e.target.checked)} /> Salaried (std deduction)</label>
        </div>
        {regime === "old" && <div className="grid grid-cols-2 gap-2">{F("80C investments", ded80c, setDed80c)}{F("Other deductions", otherDed, setOtherDed)}</div>}
        <p className="text-xs text-muted-foreground">Simplified estimate (FY 2024-25 slabs) — surcharge for very high incomes and some deductions are not modelled. Confirm with your CA.</p>
      </Card>

      <Card className="p-5 space-y-3 text-sm">
        <div className="font-semibold">Estimated tax</div>
        <Row label="Taxable income" value={inr(m.taxable)} />
        <Row label="Income tax" value={inr(m.tax)} />
        <Row label="+ 4% cess" value={inr(m.cess)} />
        <Row label="Total tax" value={inr(m.total)} strong cls="text-danger" />
        <Row label="Effective rate" value={`${m.effective.toFixed(1)}%`} />
        <Row label="After-tax income" value={inr(m.takeHome)} strong cls="text-success" />

        <div className={`rounded-lg border p-3 ${compare.better === regime ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
          <b className={compare.better === regime ? "text-success" : "text-warning"}>{compare.better} regime is better</b> for you by {inr(compare.save)}/yr.
          {compare.better !== regime && " Consider switching."}
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Advance tax instalments (15 Jun / Sep / Dec / Mar)</div>
          <div className="grid grid-cols-4 gap-2">
            {m.adv.map((a, i) => <div key={i} className="rounded-lg border p-2 text-center"><div className="text-[10px] text-muted-foreground">{["15%", "45%", "75%", "100%"][i]}</div><div className="font-semibold text-xs">{inr(a)}</div></div>)}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, cls = "", strong }: { label: string; value: string; cls?: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between py-1.5 ${strong ? "border-t font-semibold" : ""}`}><span className={strong ? "" : "text-muted-foreground"}>{label}</span><span className={`tabular-nums ${cls}`}>{value}</span></div>;
}
