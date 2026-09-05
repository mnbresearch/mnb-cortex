"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";
import { computeTax, RATES_AS_OF } from "@/lib/tax-slabs";

/**
 * The slab ladder, the deductions, the rebate and the surcharge all now come
 * from `@/lib/tax-slabs`, which payroll-calc.tsx also uses. They used to be
 * hardcoded here AND separately there, at FY 2024-25 values, and had drifted
 * apart from each other as well as from the law. See that file for the detail.
 */
export function TaxEstimator() {
  const [income, setIncome] = useState(1_500_000);
  const [regime, setRegime] = useState<"new" | "old">("new");
  const [salaried, setSalaried] = useState(true);
  const [ded80c, setDed80c] = useState(150_000);
  const [otherDed, setOtherDed] = useState(0);

  /* 80C is statutorily capped at ₹1.5L, so cap the input rather than trusting it. */
  const deductions = Math.min(ded80c, 150_000) + otherDed;

  const m = useMemo(() => {
    const r = computeTax(income, regime, { salaried, deductions });
    return {
      ...r,
      effective: income ? (r.total / income) * 100 : 0,
      takeHome: income - r.total,
      /* Advance tax instalments: 15 / 45 / 75 / 100% cumulative. */
      adv: [0.15, 0.30, 0.30, 0.25].map((p) => r.total * p),
    };
  }, [income, regime, salaried, deductions]);

  const compare = useMemo(() => {
    const nt = computeTax(income, "new", { salaried }).total;
    const ot = computeTax(income, "old", { salaried, deductions }).total;
    return { nt, ot, better: nt <= ot ? "new" : "old", save: Math.abs(nt - ot) };
  }, [income, salaried, deductions]);

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
            <select value={regime} onChange={(e) => setRegime(e.target.value as "new" | "old")} className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="new">New</option><option value="old">Old</option></select></label>
          <label className="text-sm flex items-center gap-2 mt-6"><input type="checkbox" checked={salaried} onChange={(e) => setSalaried(e.target.checked)} /> Salaried (std deduction)</label>
        </div>
        {regime === "old" && <div className="grid grid-cols-2 gap-2">{F("80C investments", ded80c, setDed80c)}{F("Other deductions", otherDed, setOtherDed)}</div>}
        {regime === "new" && (
          /* Say so rather than silently dropping them — the old code just ignored
             these fields under the new regime with nothing on screen to explain it. */
          <p className="text-xs text-muted-foreground">The new regime does not allow 80C or most other deductions, so only the standard deduction applies.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Rates as of <b>{RATES_AS_OF}</b>. Slabs, standard deduction, 87A rebate, marginal relief, surcharge and cess are modelled;
          HRA, LTA and capital-gains rates are not. An estimate, not advice — confirm with your CA.
        </p>
      </Card>

      <Card className="p-5 space-y-3 text-sm">
        <div className="font-semibold">Estimated tax</div>
        <Row label="Taxable income" value={inr(m.taxable)} />
        <Row label="Income tax" value={inr(m.base)} />
        {m.rebate > 0 && <Row label="− 87A rebate" value={inr(m.rebate)} cls="text-success" />}
        {m.surcharge > 0 && <Row label="+ surcharge" value={inr(m.surcharge)} />}
        <Row label="+ 4% cess" value={inr(m.cess)} />
        <Row label="Total tax" value={inr(m.total)} strong cls="text-danger" />
        <Row label="Effective rate" value={`${m.effective.toFixed(1)}%`} />
        <Row label="After-tax income" value={inr(m.takeHome)} strong cls="text-success" />

        {m.marginalRelief && (
          /* Worth saying out loud: without relief the number here would look
             absurd, and a user who has seen the raw slab figure elsewhere will
             otherwise think this page is broken. */
          <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
            <b className="text-success">Marginal relief applied.</b> Your income is just over the rebate threshold,
            so the tax is capped at the amount by which you exceed it.
          </div>
        )}

        <div className={`rounded-lg border p-3 ${compare.better === regime ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
          {compare.save < 1 ? (
            <>Both regimes come out the same for you.</>
          ) : (
            <>
              <b className={compare.better === regime ? "text-success" : "text-warning"}>
                {compare.better === "new" ? "New" : "Old"} regime is better
              </b> for you by {inr(compare.save)}/yr.
              {compare.better !== regime && " Consider switching."}
            </>
          )}
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
