"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function EpfCalc() {
  const [basic, setBasic] = useState(25000);  // Basic + DA (PF wage)
  const [gross, setGross] = useState(45000);  // gross for ESI eligibility

  const m = useMemo(() => {
    const pfWage = basic;
    const epsWage = Math.min(pfWage, 15000);
    const empPF = Math.round(pfWage * 0.12);
    const eps = Math.round(epsWage * 0.0833);
    const erEPF = Math.round(pfWage * 0.12) - eps; // employer 12% split: EPS + EPF
    const esiApplies = gross <= 21000;
    const empESI = esiApplies ? Math.round(gross * 0.0075) : 0;
    const erESI = esiApplies ? Math.round(gross * 0.0325) : 0;
    const employee = empPF + empESI;
    const employer = eps + erEPF + erESI;
    return { empPF, eps, erEPF, empESI, erESI, esiApplies, employee, employer, ctc: employer };
  }, [basic, gross]);

  const F = (label: string, value: number, set: (n: number) => void) => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">₹</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );
  const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between py-1.5 border-b last:border-0 text-sm"><span className="text-muted-foreground">{k}</span><span className="font-medium tabular-nums">{v}</span></div>;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          {F("Basic + DA (PF wage) /mo", basic, setBasic)}
          {F("Gross salary /mo (for ESI)", gross, setGross)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Employee deduction" value={inr(m.employee)} />
          <Stat label="Employer contribution" value={inr(m.employer)} />
          <Stat label="Total to remit /mo" value={inr(m.employee + m.employer)} highlight />
        </div>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5"><div className="font-semibold mb-2">Employee (deducted from salary)</div>
          <Row k="EPF (12%)" v={inr(m.empPF)} />
          <Row k={`ESI (0.75%)${m.esiApplies ? "" : " — N/A"}`} v={inr(m.empESI)} />
        </Card>
        <Card className="p-5"><div className="font-semibold mb-2">Employer (over and above salary)</div>
          <Row k="EPF (3.67%)" v={inr(m.erEPF)} />
          <Row k="EPS pension (8.33%, capped ₹15k wage)" v={inr(m.eps)} />
          <Row k={`ESI (3.25%)${m.esiApplies ? "" : " — N/A"}`} v={inr(m.erESI)} />
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">ESI applies only when gross ≤ ₹21,000/month. EPS (pension) is 8.33% of PF wage capped at ₹15,000. Employer EPF is the remainder of the 12%. Admin charges are not included.</p>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
