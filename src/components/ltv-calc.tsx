"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function LtvCalc() {
  const [arpu, setArpu] = useState(2500);
  const [margin, setMargin] = useState(70);
  const [churn, setChurn] = useState(4);
  const [cac, setCac] = useState(9000);

  const m = useMemo(() => {
    const grossPerMonth = arpu * (margin / 100);
    const lifetimeMonths = churn > 0 ? 100 / churn : Infinity;
    const ltv = churn > 0 ? grossPerMonth / (churn / 100) : Infinity;
    const ratio = cac > 0 && ltv !== Infinity ? ltv / cac : Infinity;
    const payback = grossPerMonth > 0 ? cac / grossPerMonth : Infinity;
    const verdict = ratio === Infinity ? "up" : ratio >= 3 ? "up" : ratio >= 1 ? "flat" : "down";
    return { grossPerMonth, lifetimeMonths, ltv, ratio, payback, verdict };
  }, [arpu, margin, churn, cac]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {F("Avg revenue / customer / mo", arpu, setArpu)}
          {F("Gross margin", margin, setMargin, "%")}
          {F("Monthly churn", churn, setChurn, "%")}
          {F("CAC (cost to acquire)", cac, setCac)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Avg lifetime" value={m.lifetimeMonths === Infinity ? "∞" : `${m.lifetimeMonths.toFixed(0)} mo`} />
          <Stat label="Lifetime value" value={m.ltv === Infinity ? "∞" : inr(m.ltv)} highlight />
          <Stat label="LTV : CAC" value={m.ratio === Infinity ? "∞" : `${m.ratio.toFixed(1)}×`} cls={m.verdict === "up" ? "text-success" : m.verdict === "down" ? "text-danger" : "text-warning"} />
          <Stat label="CAC payback" value={m.payback === Infinity ? "—" : `${m.payback.toFixed(1)} mo`} />
        </div>
      </Card>

      <Card className="p-5 text-sm">
        <div className="font-semibold mb-1">Reading it</div>
        <p className="text-muted-foreground">
          A healthy business earns <b>3× or more</b> in lifetime value for every rupee of acquisition cost, and recovers CAC in under 12 months.
          {m.ratio !== Infinity && m.ratio < 3 && m.ratio >= 1 && " Yours is positive but thin — either lift retention (lower churn) or spend less to acquire."}
          {m.ratio !== Infinity && m.ratio < 1 && " Right now you lose money on each customer — fix churn or CAC before scaling spend."}
          {(m.ratio === Infinity || m.ratio >= 3) && " Yours looks strong — you can afford to invest more in acquisition."}
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
