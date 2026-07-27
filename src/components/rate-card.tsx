"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function RateCard() {
  const [targetIncome, setTargetIncome] = useState(1_800_000); // desired annual take-home
  const [costs, setCosts] = useState(600_000);                 // annual business costs
  const [profitPct, setProfitPct] = useState(20);              // margin buffer
  const [workDays, setWorkDays] = useState(220);               // working days/yr
  const [billablePct, setBillablePct] = useState(65);          // % of day that's billable
  const [hoursPerDay, setHoursPerDay] = useState(8);

  const m = useMemo(() => {
    const revenueNeeded = (targetIncome + costs) * (1 + profitPct / 100);
    const billableDays = workDays * (billablePct / 100);
    const billableHours = billableDays * hoursPerDay;
    const dayRate = billableDays > 0 ? revenueNeeded / billableDays : 0;
    const hourRate = billableHours > 0 ? revenueNeeded / billableHours : 0;
    return { revenueNeeded, billableDays, billableHours, dayRate, hourRate };
  }, [targetIncome, costs, profitPct, workDays, billablePct, hoursPerDay]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {F("Target take-home / year", targetIncome, setTargetIncome)}
          {F("Business costs / year", costs, setCosts)}
          {F("Profit buffer", profitPct, setProfitPct, "%")}
          {F("Working days / year", workDays, setWorkDays, "#")}
          {F("Billable share of time", billablePct, setBillablePct, "%")}
          {F("Hours / day", hoursPerDay, setHoursPerDay, "#")}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Revenue you must bill" value={inr(m.revenueNeeded)} />
          <Stat label="Billable days / year" value={`${m.billableDays.toFixed(0)}`} />
          <Stat label="Day rate" value={inr(m.dayRate)} highlight />
          <Stat label="Hourly rate" value={inr(m.hourRate)} highlight />
        </div>
      </Card>
      <Card className="p-5 text-sm">
        <div className="font-semibold mb-1">Why the rate feels high</div>
        <p className="text-muted-foreground">
          Only about <b>{billablePct}%</b> of your time is billable — the rest is sales, admin, and downtime. So to take home {inr(targetIncome)},
          you can't just divide by total hours; you divide by the {m.billableHours.toFixed(0)} hours you actually bill. That's why a sustainable
          rate lands near <b>{inr(m.hourRate)}/hour</b>. Charging less means working more days to reach the same income.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
