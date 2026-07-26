"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function Amortization() {
  const [principal, setPrincipal] = useState(5_000_000);
  const [rate, setRate] = useState(14);
  const [years, setYears] = useState(5);

  const m = useMemo(() => {
    const n = years * 12;
    const r = rate / 100 / 12;
    const emi = r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const rows: { i: number; interest: number; principal: number; balance: number }[] = [];
    let bal = principal, totalInterest = 0;
    for (let i = 1; i <= n; i++) {
      const interest = bal * r;
      const princ = emi - interest;
      bal = Math.max(0, bal - princ);
      totalInterest += interest;
      rows.push({ i, interest, principal: princ, balance: bal });
    }
    return { emi, n, rows, totalInterest, totalPaid: emi * n };
  }, [principal, rate, years]);

  const F = (label: string, value: number, set: (n: number) => void, suffix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring">
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /><span className="text-xs text-muted-foreground">{suffix}</span>
      </div></label>
  );

  // Yearly rollup for the chart + compact table
  const yearly = useMemo(() => {
    const out: { year: number; interest: number; principal: number; balance: number }[] = [];
    for (let y = 0; y < years; y++) {
      const slice = m.rows.slice(y * 12, y * 12 + 12);
      out.push({ year: y + 1, interest: slice.reduce((s, x) => s + x.interest, 0), principal: slice.reduce((s, x) => s + x.principal, 0), balance: slice[slice.length - 1]?.balance || 0 });
    }
    return out;
  }, [m.rows, years]);
  const maxPay = Math.max(...yearly.map((y) => y.interest + y.principal), 1);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">{F("Loan amount", principal, setPrincipal)}{F("Interest rate", rate, setRate, "%")}{F("Tenure", years, setYears, "yr")}</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Monthly EMI" value={inr(m.emi)} highlight />
          <Stat label="Total interest" value={inr(m.totalInterest)} cls="text-danger" />
          <Stat label="Total repayment" value={inr(m.totalPaid)} />
          <Stat label="Interest as % of loan" value={`${((m.totalInterest / principal) * 100).toFixed(0)}%`} />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold">Principal vs interest, by year</div>
        <div className="space-y-2">
          {yearly.map((y) => (
            <div key={y.year}>
              <div className="flex justify-between text-xs text-muted-foreground mb-0.5"><span>Year {y.year}</span><span>balance {inr(y.balance)}</span></div>
              <div className="flex h-4 rounded overflow-hidden" style={{ width: `${((y.interest + y.principal) / maxPay) * 100}%` }}>
                <div className="brand-gradient" style={{ width: `${(y.principal / (y.interest + y.principal)) * 100}%` }} title={`Principal ${inr(y.principal)}`} />
                <div className="bg-danger/60" style={{ width: `${(y.interest / (y.interest + y.principal)) * 100}%` }} title={`Interest ${inr(y.interest)}`} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded brand-gradient" /> Principal</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded bg-danger/60" /> Interest</span></div>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-2">First 12 months</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-4 font-medium">Month</th><th className="py-2 pr-4 font-medium">Principal</th><th className="py-2 pr-4 font-medium">Interest</th><th className="py-2 font-medium">Balance</th></tr></thead>
            <tbody>
              {m.rows.slice(0, 12).map((r) => (
                <tr key={r.i} className="border-b last:border-0"><td className="py-1.5 pr-4">{r.i}</td><td className="py-1.5 pr-4">{inr(r.principal)}</td><td className="py-1.5 pr-4 text-danger">{inr(r.interest)}</td><td className="py-1.5">{inr(r.balance)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Early EMIs are mostly interest — prepaying in the first years saves the most.</p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
