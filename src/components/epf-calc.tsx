"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";
import { computeEpf, EPF_RATES_AS_OF, PF_WAGE_CEILING_MONTHLY } from "@/lib/epf";

/*
  THIS FILE AND payroll-calc.tsx GAVE DIFFERENT ANSWERS to the same statutory
  question. It computed PF on the full basic; payroll capped it at the ₹15,000
  wage ceiling. On a ₹25,000 basic that is ₹3,000 a month against ₹1,800, and
  an owner preparing an offer sees both screens.

  Both were defensible — contributing above the ceiling is a real and common
  employer choice — so the fix is not to pick one. lib/epf.ts holds the single
  ladder and makes the choice explicit, and this page now exposes it as the
  policy toggle it always secretly was. Nothing it used to show is gone.
*/
export function EpfCalc() {
  const [basic, setBasic] = useState(25000);  // Basic + DA (PF wage)
  const [gross, setGross] = useState(45000);  // gross for ESI eligibility
  const [aboveCeiling, setAboveCeiling] = useState(false);

  const m = useMemo(() => {
    const r = computeEpf({ basic, gross, aboveCeiling });
    return {
      empPF: r.employeePF, eps: r.employerEPS, erEPF: r.employerEPF,
      empESI: r.employeeESI, erESI: r.employerESI, esiApplies: r.esiApplies,
      employee: r.employeeTotal, employer: r.employerTotal,
      pfWage: r.pfWage, ceilingBinds: r.ceilingBinds,
    };
  }, [basic, gross, aboveCeiling]);

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
        {/*
          THE POLICY, ASKED RATHER THAN ASSUMED.

          Only offered when it changes the answer — below the ceiling the two
          policies are identical, and a toggle that does nothing is a question
          the user has to think about for no reason.
        */}
        {m.ceilingBinds && (
          <label className="flex items-start gap-2.5 rounded-lg border bg-secondary/30 p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={aboveCeiling}
              onChange={(e) => setAboveCeiling(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
            />
            <span>
              <span className="font-medium">We contribute PF on the full basic, not the ₹{PF_WAGE_CEILING_MONTHLY.toLocaleString("en-IN")} ceiling.</span>{" "}
              <span className="text-muted-foreground">
                Leave this off for the statutory minimum, which is what most SMEs do. Either way the
                pension (EPS) slice stays capped at ₹{PF_WAGE_CEILING_MONTHLY.toLocaleString("en-IN")} — that cap is law, not policy.
                PF is currently computed on ₹{m.pfWage.toLocaleString("en-IN")}.
              </span>
            </span>
          </label>
        )}
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
      <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/80">{EPF_RATES_AS_OF}.</span> ESI applies only when gross ≤ ₹21,000/month. EPS (pension) is 8.33% of PF wage capped at ₹15,000. Employer EPF is the remainder of the 12%. Admin charges are not included.</p>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
