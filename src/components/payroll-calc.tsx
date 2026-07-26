"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

/**
 * Simplified India CTC → take-home estimate.
 * Uses common structuring assumptions; not a substitute for a payroll pro.
 */
export function PayrollCalc() {
  const [ctc, setCtc] = useState(1_200_000);       // annual CTC ₹
  const [basicPct, setBasicPct] = useState(45);    // basic as % of CTC
  const [metro, setMetro] = useState(true);
  const [regime, setRegime] = useState<"new" | "old">("new");

  const m = useMemo(() => {
    const basic = ctc * (basicPct / 100);
    const hra = basic * (metro ? 0.5 : 0.4);
    // Employer PF (12% of basic, capped at ₹1800/mo → ₹21600/yr on ₹15k ceiling is common; use 12% of basic capped)
    const pfBaseAnnual = Math.min(basic, 15000 * 12);
    const employerPf = pfBaseAnnual * 0.12;
    const employeePf = pfBaseAnnual * 0.12;
    const gratuity = basic * 0.0481;
    const special = Math.max(0, ctc - basic - hra - employerPf - gratuity);
    const gross = ctc - employerPf - gratuity; // in-hand gross before employee deductions

    // Tax (very simplified slabs, annual, FY-ish)
    const std = 50000;
    let taxable = gross - std - employeePf;
    let tax = 0;
    if (regime === "new") {
      const s = taxable;
      if (s > 1500000) tax = 150000 + (s - 1500000) * 0.30;
      else if (s > 1200000) tax = 90000 + (s - 1200000) * 0.20;
      else if (s > 900000) tax = 45000 + (s - 900000) * 0.15;
      else if (s > 600000) tax = 15000 + (s - 600000) * 0.10;
      else if (s > 300000) tax = (s - 300000) * 0.05;
      if (taxable <= 700000) tax = 0; // rebate 87A
    } else {
      const s = taxable - 150000; // assume 80C fully used
      if (s > 1000000) tax = 112500 + (s - 1000000) * 0.30;
      else if (s > 500000) tax = 12500 + (s - 500000) * 0.20;
      else if (s > 250000) tax = (s - 250000) * 0.05;
      if (taxable - 150000 <= 500000) tax = 0;
    }
    tax = Math.max(0, tax) * 1.04; // 4% cess
    const annualTakeHome = gross - employeePf - tax;
    return { basic, hra, special, employerPf, employeePf, gratuity, gross, tax, annualTakeHome, monthly: annualTakeHome / 12 };
  }, [ctc, basicPct, metro, regime]);

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
        <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Tax regime</span>
          <select className={I} value={regime} onChange={(e) => setRegime(e.target.value as any)}><option value="new">New</option><option value="old">Old (80C used)</option></select></label>
        <p className="text-xs text-muted-foreground pt-1">Estimate only — actual take-home depends on your exact structure, investments and state professional tax. Confirm with your payroll team.</p>
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
        <Row label="Less: Income tax + cess" value={`(${inr(m.tax)})`} />
        <Row label="Annual take-home" value={inr(m.annualTakeHome)} strong cls="text-success" />
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
          <div className="text-xs text-muted-foreground">Monthly take-home (approx)</div>
          <div className="text-2xl font-bold">{inr(m.monthly)}</div>
        </div>
      </Card>
    </div>
  );
}
