"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

const Z: Record<string, number> = { "90%": 1.28, "95%": 1.65, "98%": 2.05, "99%": 2.33 };

function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring">
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

export function ReorderOptimizer() {
  const [demand, setDemand] = useState(120000);   // annual units
  const [orderCost, setOrderCost] = useState(2500); // ₹/order
  const [holding, setHolding] = useState(40);      // ₹/unit/year
  const [lead, setLead] = useState(12);            // days
  const [dailyStd, setDailyStd] = useState(60);    // units std dev
  const [service, setService] = useState("95%");

  const m = useMemo(() => {
    const eoq = holding > 0 ? Math.sqrt((2 * demand * orderCost) / holding) : 0;
    const daily = demand / 365;
    const safety = Z[service] * dailyStd * Math.sqrt(lead);
    const rop = daily * lead + safety;
    const orders = eoq > 0 ? demand / eoq : 0;
    const annualCost = orders * orderCost + (eoq / 2 + safety) * holding;
    return { eoq, daily, safety, rop, orders, annualCost };
  }, [demand, orderCost, holding, lead, dailyStd, service]);

  const r = (n: number) => Math.round(n).toLocaleString("en-IN");

  return (
    <Card className="p-5 space-y-5">
      <div><div className="font-semibold">Reorder optimizer (EOQ + safety stock)</div><div className="text-sm text-muted-foreground">Order the right quantity, at the right time, without stockouts.</div></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Annual demand" value={demand} onChange={setDemand} suffix="units" />
        <Field label="Cost per order" value={orderCost} onChange={setOrderCost} suffix="₹" />
        <Field label="Holding cost / unit / yr" value={holding} onChange={setHolding} suffix="₹" />
        <Field label="Lead time" value={lead} onChange={setLead} suffix="days" />
        <Field label="Daily demand variability (σ)" value={dailyStd} onChange={setDailyStd} suffix="units" />
        <label className="block">
          <span className="text-sm text-muted-foreground">Service level</span>
          <select value={service} onChange={(e) => setService(e.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring">
            {Object.keys(Z).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Economic order qty" value={`${r(m.eoq)} units`} highlight />
        <Stat label="Reorder point" value={`${r(m.rop)} units`} highlight />
        <Stat label="Safety stock" value={`${r(m.safety)} units`} />
        <Stat label="Orders / year" value={`${m.orders.toFixed(1)}`} />
      </div>
      <div className="rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">Optimal total inventory cost: </span><b>{inr(m.annualCost)}/yr</b>
        <span className="text-muted-foreground"> — order <b className="text-foreground">{r(m.eoq)} units</b> whenever stock drops to <b className="text-foreground">{r(m.rop)} units</b>.</span>
      </div>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold tabular-nums">{value}</div></div>;
}
