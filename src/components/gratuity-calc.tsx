"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function GratuityCalc() {
  const [salary, setSalary] = useState(60000);   // last drawn basic + DA (monthly)
  const [years, setYears] = useState(7);
  const [months, setMonths] = useState(4);

  const m = useMemo(() => {
    // Rounding: >= 6 months counts as a full year.
    const totalYears = years + (months >= 6 ? 1 : 0);
    const eligible = years >= 5;
    const raw = (salary * 15 * totalYears) / 26;
    const gratuity = Math.min(raw, 2_000_000); // statutory cap ₹20L
    return { totalYears, eligible, gratuity, capped: raw > 2_000_000 };
  }, [salary, years, months]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          {F("Last drawn salary (Basic + DA) /mo", salary, setSalary)}
          {F("Years of service", years, setYears, "#")}
          {F("Extra months", months, setMonths, "#")}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Service counted" value={`${m.totalYears} yrs`} />
          <Stat label="Eligible (≥5 yrs)" value={m.eligible ? "Yes" : "No"} cls={m.eligible ? "text-success" : "text-danger"} />
          <Stat label="Gratuity payable" value={m.eligible ? inr(m.gratuity) : "—"} highlight />
        </div>
      </Card>
      <Card className="p-5 text-sm text-muted-foreground">
        Gratuity = (last salary × 15 × years) ÷ 26, capped at ₹20,00,000 under the Payment of Gratuity Act. Employees generally qualify after 5 continuous years; 6+ months in the final year rounds up.
        {m.capped && <span className="text-warning"> This amount is capped at the ₹20L statutory ceiling.</span>}
        {!m.eligible && <span className="text-danger"> Below 5 years — gratuity isn't payable yet (except on death/disability).</span>}
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
