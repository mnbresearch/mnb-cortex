"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";
import { computeTax, RATES_AS_OF } from "@/lib/tax-slabs";

/**
 * India CTC → take-home.
 *
 * The tax now comes from `@/lib/tax-slabs`, shared with the tax estimator.
 * This file used to carry its OWN if/else ladder with pre-computed cumulative
 * amounts (`if (s > 1500000) tax = 150000 + ...`), which was a different and
 * older vintage than the estimator's array — so the two pages disagreed about
 * the tax on the same salary. Beyond the stale bands, four things were wrong:
 *
 *   the ₹50,000 standard deduction was applied under BOTH regimes (the new
 *   regime's is ₹75,000);
 *
 *   employee PF was deducted from taxable income under both regimes, but the
 *   new regime does not allow it;
 *
 *   under the old regime the code subtracted a further flat ₹1,50,000 with the
 *   comment "assume 80C fully used", ON TOP of the PF it had already deducted —
 *   double-counting, since PF *is* 80C, and silently, with nothing on screen
 *   telling the reader an assumption that large had been made on their behalf.
 *   It is now an input, defaulted to PF alone;
 *
 *   professional tax was named in the disclaimer and then not modelled.
 *
 * That matters more here than on the estimator page, because the output of this
 * one is a bold "Monthly take-home" that an owner reads out when making an
 * offer, and a candidate hears as a number they can bank.
 */
export function PayrollCalc() {
  const [ctc, setCtc] = useState(1_200_000);
  const [basicPct, setBasicPct] = useState(45);
  const [metro, setMetro] = useState(true);
  const [regime, setRegime] = useState<"new" | "old">("new");
  /** Old-regime 80C beyond PF (ELSS, insurance, principal…). Was assumed, now asked. */
  const [other80c, setOther80c] = useState(0);
  /** ₹200/mo in most states, ₹2,400/yr. Nil in a few (e.g. Delhi, UP, Haryana). */
  const [profTaxMonthly, setProfTaxMonthly] = useState(200);

  const m = useMemo(() => {
    const basic = ctc * (basicPct / 100);
    const hra = basic * (metro ? 0.5 : 0.4);

    /* PF on the ₹15,000/mo statutory wage ceiling, which is what most SMEs use. */
    const pfBaseAnnual = Math.min(basic, 15_000 * 12);
    const employerPf = pfBaseAnnual * 0.12;
    const employeePf = pfBaseAnnual * 0.12;
    const gratuity = basic * 0.0481;

    const beforeSpecial = basic + hra + employerPf + gratuity;
    const special = Math.max(0, ctc - beforeSpecial);
    /* If basic% is set so high that the components exceed CTC, `special` clamps
       to zero and every number below quietly stops adding up. Say so instead. */
    const overAllocated = beforeSpecial > ctc;

    const profTax = Math.min(profTaxMonthly, 2_500) * 12;
    const gross = ctc - employerPf - gratuity;

    /*
      Employee PF is an 80C investment, not a separate deduction. Under the old
      regime it counts toward the ₹1.5L cap along with anything else; under the
      new regime neither is allowed.
    */
    const deductions = regime === "old"
      ? Math.min(employeePf + other80c, 150_000) + profTax
      : 0;

    const t = computeTax(gross, regime, { salaried: true, deductions });
    const annualTakeHome = gross - employeePf - profTax - t.total;

    return {
      basic, hra, special, employerPf, employeePf, gratuity, gross, profTax,
      overAllocated, deductions,
      tax: t.total, taxable: t.taxable, marginalRelief: t.marginalRelief,
      annualTakeHome, monthly: annualTakeHome / 12,
    };
  }, [ctc, basicPct, metro, regime, other80c, profTaxMonthly]);

  const Row = ({ label, value, cls = "", strong = false }: { label: string; value: string; cls?: string; strong?: boolean }) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "border-t font-semibold" : ""}`}><span className={strong ? "" : "text-muted-foreground"}>{label}</span><span className={`tabular-nums ${cls}`}>{value}</span></div>
  );
  const I = "rounded-md border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 space-y-3">
        <div className="font-semibold">Package</div>
        <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Annual CTC</span>
          <input className={I + " w-40 text-right"} type="number" value={ctc} onChange={(e) => setCtc(Number(e.target.value))} /></label>
        <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Basic (% of CTC)</span>
          <span><input className={I + " w-16 text-right"} type="number" value={basicPct} onChange={(e) => setBasicPct(Number(e.target.value))} /> %</span></label>
        <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Metro city (HRA)</span>
          <input type="checkbox" checked={metro} onChange={(e) => setMetro(e.target.checked)} /></label>
        <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Professional tax (₹/month)</span>
          <input className={I + " w-24 text-right"} type="number" value={profTaxMonthly} onChange={(e) => setProfTaxMonthly(Number(e.target.value))} /></label>
        <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Tax regime</span>
          <select className={I} value={regime} onChange={(e) => setRegime(e.target.value as "new" | "old")}><option value="new">New</option><option value="old">Old</option></select></label>
        {regime === "old" && (
          <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Other 80C (beyond PF)</span>
            <input className={I + " w-32 text-right"} type="number" value={other80c} onChange={(e) => setOther80c(Number(e.target.value))} /></label>
        )}
        {m.overAllocated && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
            <b className="text-warning">Basic is too high for this CTC.</b> Basic + HRA + employer PF + gratuity already
            exceed the CTC, so there is no special allowance left and the breakup below will not add up. Lower the basic %.
          </div>
        )}
        <p className="text-xs text-muted-foreground pt-1">
          Rates as of <b>{RATES_AS_OF}</b>. PF on the ₹15,000/month wage ceiling. HRA exemption under section 10(13A)
          is <b>not</b> modelled, so the old regime is understated for anyone paying rent. Estimate only — confirm with your payroll team.
        </p>
      </Card>

      <Card className="p-5 text-sm">
        <div className="font-semibold mb-2">Breakup (annual)</div>
        <Row label="Basic" value={inr(m.basic)} />
        <Row label="HRA" value={inr(m.hra)} />
        <Row label="Special allowance" value={inr(m.special)} />
        <Row label="Employer PF" value={inr(m.employerPf)} />
        <Row label="Gratuity provision" value={inr(m.gratuity)} />
        <Row label="Gross (in-hand before deductions)" value={inr(m.gross)} strong />
        <Row label="Less: Employee PF" value={`(${inr(m.employeePf)})`} />
        <Row label="Less: Professional tax" value={`(${inr(m.profTax)})`} />
        <Row label="Less: Income tax + cess" value={`(${inr(m.tax)})`} />
        <Row label="Annual take-home" value={inr(m.annualTakeHome)} strong cls="text-success" />
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
          <div className="text-xs text-muted-foreground">Monthly take-home (approx)</div>
          <div className="text-2xl font-bold">{inr(m.monthly)}</div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Taxable income {inr(m.taxable)}
          {m.deductions > 0 && <> after {inr(m.deductions)} of deductions</>}
          {m.marginalRelief && <> · marginal relief applied</>}
        </p>
      </Card>
    </div>
  );
}
