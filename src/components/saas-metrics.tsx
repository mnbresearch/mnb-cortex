"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

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

export function SaasMetrics() {
  const [customers, setCustomers] = useState(1200);
  const [arpu, setArpu] = useState(1500);          // ₹ per customer per month
  const [churn, setChurn] = useState(4);           // % monthly logo churn
  const [newPerMonth, setNewPerMonth] = useState(180);
  const [cac, setCac] = useState(2200);            // ₹ to acquire one customer
  const [grossMargin, setGrossMargin] = useState(78); // %
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const mrr = customers * arpu;
    const arr = mrr * 12;
    const churnRate = churn / 100;
    const lifetimeMonths = churnRate > 0 ? 1 / churnRate : Infinity;
    const ltv = churnRate > 0 ? arpu * (grossMargin / 100) * lifetimeMonths : Infinity;
    const ratio = cac > 0 && ltv !== Infinity ? ltv / cac : Infinity;
    const paybackMonths = arpu * (grossMargin / 100) > 0 ? cac / (arpu * (grossMargin / 100)) : Infinity;
    const churnedPerMonth = customers * churnRate;
    const netNew = newPerMonth - churnedPerMonth;
    const growthPct = customers > 0 ? (netNew / customers) * 100 : 0;
    // 12-month customer projection
    const proj: number[] = [];
    let c = customers;
    for (let i = 0; i < 12; i++) { c = c + newPerMonth - c * churnRate; proj.push(c); }
    return { mrr, arr, lifetimeMonths, ltv, ratio, paybackMonths, churnedPerMonth, netNew, growthPct, proj };
  }, [customers, arpu, churn, newPerMonth, cac, grossMargin]);

  async function analyse() {
    setLoading(true); setOut("");
    const input = `SaaS metrics: ${customers} customers, ARPU ₹${arpu}/mo, monthly churn ${churn}%, ${newPerMonth} new customers/mo, CAC ₹${cac}, gross margin ${grossMargin}%. Computed: MRR ${inr(m.mrr)}, ARR ${inr(m.arr)}, LTV ${m.ltv === Infinity ? "n/a" : inr(m.ltv)}, LTV:CAC ${m.ratio === Infinity ? "n/a" : m.ratio.toFixed(1)}x, CAC payback ${m.paybackMonths.toFixed(1)} months, net new ${m.netNew.toFixed(0)}/mo (${m.growthPct.toFixed(1)}% growth). What are the 3 highest-leverage moves to improve these, and which metric is the real constraint?`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "strategy", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const max = Math.max(...m.proj, customers);
  const ratioTone = m.ratio >= 3 ? "text-success" : m.ratio >= 1 ? "text-warning" : "text-danger";
  const payTone = m.paybackMonths <= 12 ? "text-success" : m.paybackMonths <= 18 ? "text-warning" : "text-danger";

  return (
    <Card className="p-5 space-y-5">
      <div>
        <div className="font-semibold">Subscription metrics</div>
        <div className="text-sm text-muted-foreground">Enter your numbers — MRR, LTV, payback and growth recalculate instantly.</div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Paying customers" value={customers} onChange={setCustomers} suffix="#" />
        <Field label="ARPU / month" value={arpu} onChange={setArpu} suffix="₹" />
        <Field label="Monthly churn" value={churn} onChange={setChurn} suffix="%" />
        <Field label="New customers / month" value={newPerMonth} onChange={setNewPerMonth} suffix="#" />
        <Field label="CAC" value={cac} onChange={setCac} suffix="₹" />
        <Field label="Gross margin" value={grossMargin} onChange={setGrossMargin} suffix="%" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="MRR" value={inr(m.mrr)} highlight />
        <Stat label="ARR" value={inr(m.arr)} highlight />
        <Stat label="LTV" value={m.ltv === Infinity ? "—" : inr(m.ltv)} />
        <Stat label="Avg. lifetime" value={m.lifetimeMonths === Infinity ? "—" : `${m.lifetimeMonths.toFixed(1)} mo`} />
        <Stat label="LTV : CAC" value={m.ratio === Infinity ? "—" : `${m.ratio.toFixed(1)}x`} cls={ratioTone} />
        <Stat label="CAC payback" value={`${m.paybackMonths.toFixed(1)} mo`} cls={payTone} />
        <Stat label="Net new / mo" value={`${m.netNew >= 0 ? "+" : ""}${m.netNew.toFixed(0)}`} cls={m.netNew >= 0 ? "text-success" : "text-danger"} />
        <Stat label="Monthly growth" value={`${m.growthPct.toFixed(1)}%`} cls={m.growthPct >= 0 ? "text-success" : "text-danger"} />
      </div>

      <div className="rounded-lg border p-4 bg-background/40">
        <div className="text-sm text-muted-foreground mb-2">12-month customer projection {m.netNew < 0 && <span className="text-danger">— shrinking: churn exceeds acquisition</span>}</div>
        <div className="flex items-end gap-1 h-24">
          {m.proj.map((v, i) => (
            <div key={i} className="flex-1 rounded-t brand-gradient" style={{ height: `${(v / max) * 100}%` }} title={`Month ${i + 1}: ${Math.round(v)}`} />
          ))}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Benchmarks: LTV:CAC above <b>3x</b> is healthy, CAC payback under <b>12 months</b> is strong, monthly churn under <b>3%</b> is good for SMB SaaS.
      </div>

      <Button onClick={analyse} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "What should I fix first? (ask the AI COO)"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
