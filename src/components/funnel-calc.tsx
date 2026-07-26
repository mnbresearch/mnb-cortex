"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}

export function FunnelCalc() {
  const [visitors, setVisitors] = useState(10000);
  const [leadRate, setLeadRate] = useState(6);       // % visitor→lead
  const [closeRate, setCloseRate] = useState(18);    // % lead→customer
  const [aov, setAov] = useState(4500);              // avg order value ₹
  const [spend, setSpend] = useState(120000);        // marketing spend ₹

  const m = useMemo(() => {
    const leads = visitors * (leadRate / 100);
    const customers = leads * (closeRate / 100);
    const revenue = customers * aov;
    const cac = customers > 0 ? spend / customers : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    const cpl = leads > 0 ? spend / leads : 0;
    return { leads, customers, revenue, cac, roas, cpl };
  }, [visitors, leadRate, closeRate, aov, spend]);

  const stages = [
    { label: "Visitors", value: visitors, pct: 100 },
    { label: "Leads", value: m.leads, pct: leadRate },
    { label: "Customers", value: m.customers, pct: leadRate * closeRate / 100 },
  ];

  return (
    <Card className="p-5 space-y-5">
      <div><div className="font-semibold">Funnel economics</div><div className="text-sm text-muted-foreground">Tune each stage and watch CAC and ROAS move.</div></div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
        <Slider label="Monthly visitors" value={visitors} min={500} max={200000} step={500} unit="" onChange={setVisitors} />
        <Slider label="Visitor → lead" value={leadRate} min={0.5} max={40} step={0.5} unit="%" onChange={setLeadRate} />
        <Slider label="Lead → customer" value={closeRate} min={1} max={60} step={1} unit="%" onChange={setCloseRate} />
        <Slider label="Average order value" value={aov} min={100} max={100000} step={100} unit="₹" onChange={setAov} />
        <Slider label="Marketing spend / mo" value={spend} min={0} max={2000000} step={5000} unit="₹" onChange={setSpend} />
      </div>

      <div className="space-y-2">
        {stages.map((s) => (
          <div key={s.label}>
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{s.label}</span><span className="font-semibold">{Math.round(s.value).toLocaleString("en-IN")}</span></div>
            <div className="h-3 rounded-full bg-secondary overflow-hidden"><div className="h-full brand-gradient" style={{ width: `${Math.max(2, s.pct)}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Revenue / mo" value={inr(m.revenue)} highlight />
        <Stat label="CAC" value={inr(m.cac)} cls={m.cac > aov ? "text-danger" : ""} />
        <Stat label="ROAS" value={`${m.roas.toFixed(1)}x`} cls={m.roas >= 3 ? "text-success" : m.roas >= 1 ? "text-warning" : "text-danger"} />
        <Stat label="Cost / lead" value={inr(m.cpl)} />
      </div>
      <p className="text-xs text-muted-foreground">If CAC is above your order value (or ROAS below 1x), you lose money on every sale — fix conversion or spend before scaling traffic.</p>
    </Card>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
