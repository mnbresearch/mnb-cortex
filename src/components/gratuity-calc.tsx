"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

/*
  THE LAW UNDER THIS PAGE CHANGED ON 21 NOVEMBER 2025.

  The four labour codes came into force that day (PIB, 21 Nov 2025; Ministry
  of Labour FAQs and employer handbook, 2026), and gratuity moved from the
  Payment of Gratuity Act, 1972 to the Code on Social Security, 2020. This page
  still cited the 1972 Act and applied its five-year rule to everyone. Two
  things the Code changed, both confirmed in the Ministry's own material:

    1. FIXED-TERM employees qualify after ONE year of service, not five.
    2. "Wages" for gratuity cannot be less than 50% of total remuneration:
       if allowances outside basic + DA + retaining allowance exceed half of
       the pay, the excess counts as wages. A low-basic salary structure no
       longer shrinks the gratuity.

  What did NOT change, and is kept: 15/26 of monthly wages per year of
  service, a final part-year of six months or more rounding up, the ₹20 lakh
  ceiling (the Code lets the Government notify it; it has not been changed),
  and the death/disablement exception to the minimum service.

  The exact counting of a fixed-term employee's part-year (the Code says
  "pro rata") is not settled in anything this repository has verified, so the
  page uses the same rounding and says to confirm it.
*/
const CEILING = 2_000_000;

export function GratuityCalc() {
  const [salary, setSalary] = useState(60000);   // last drawn basic + DA (+ retaining allowance), monthly
  const [total, setTotal] = useState(0);         // total monthly remuneration, optional — for the 50% rule
  const [fixedTerm, setFixedTerm] = useState(false);
  const [years, setYears] = useState(7);
  const [months, setMonths] = useState(4);

  const m = useMemo(() => {
    // Rounding: >= 6 months counts as a full year.
    const totalYears = Math.max(0, years) + (months >= 6 ? 1 : 0);
    /* Five continuous years for a regular employee; one year for a fixed-term one (Code on Social Security, s.53). */
    const minYears = fixedTerm ? 1 : 5;
    const eligible = years >= minYears;
    /* The 50% rule: wages are at least half of total remuneration. */
    const wages = Math.max(Math.max(0, salary), total > 0 ? total * 0.5 : 0);
    const raw = (wages * 15 * totalYears) / 26;
    const gratuity = Math.min(raw, CEILING); // statutory cap ₹20L
    return { totalYears, eligible, minYears, wages, wagesLifted: wages > salary, gratuity, capped: raw > CEILING };
  }, [salary, total, fixedTerm, years, months]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {F("Last drawn Basic + DA /mo", salary, setSalary)}
          {F("Total monthly pay (optional)", total, setTotal)}
          {F("Years of service", years, setYears, "#")}
          {F("Extra months", months, setMonths, "#")}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fixedTerm} onChange={(e) => setFixedTerm(e.target.checked)} className="h-4 w-4" />
          Fixed-term employee (contract for a set period)
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Service counted" value={`${m.totalYears} yrs`} />
          <Stat label="Wages used" value={inr(m.wages)} />
          <Stat label={`Eligible (≥${m.minYears} yr${m.minYears === 1 ? "" : "s"})`} value={m.eligible ? "Yes" : "No"} cls={m.eligible ? "text-success" : "text-danger"} />
          <Stat label="Gratuity payable" value={m.eligible ? inr(m.gratuity) : "—"} highlight />
        </div>
      </Card>
      <Card className="p-5 text-sm text-muted-foreground">
        Gratuity = (last wages × 15 × years) ÷ 26, capped at ₹20,00,000, under the Code on Social Security, 2020 (in force
        from 21 November 2025, replacing the Payment of Gratuity Act). Regular employees qualify after 5 continuous years;
        fixed-term employees after 1 year. A final 6+ months rounds up. Wages are basic + DA (+ retaining allowance), but
        never less than half your total pay — enter total pay to apply that rule.
        {m.wagesLifted && <span className="text-foreground"> Your basic + DA is under half your total pay, so half the total is used as wages.</span>}
        {fixedTerm && <span> For fixed-term contracts the Code pays gratuity pro rata — confirm how a part-year is counted with your CA.</span>}
        {m.capped && <span className="text-warning"> This amount is capped at the ₹20L statutory ceiling.</span>}
        {!m.eligible && <span className="text-danger"> Below {m.minYears} year{m.minYears === 1 ? "" : "s"} — gratuity isn&apos;t payable yet (except on death/disability).</span>}
        <span className="block text-xs mt-2">Service before 21 November 2025 was earned under the 1972 Act; the Ministry of Labour&apos;s FAQs apply the Code to exits on or after that date. An estimate, not advice.</span>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
