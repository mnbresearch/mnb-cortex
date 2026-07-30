"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

const SCHEDULE = [
  { by: "15 Jun", cum: 0.15 },
  { by: "15 Sep", cum: 0.45 },
  { by: "15 Dec", cum: 0.75 },
  { by: "15 Mar", cum: 1.0 },
];

export function AdvanceTax() {
  const [tax, setTax] = useState(240000);   // estimated annual tax liability
  const [paid, setPaid] = useState(0);      // already paid this year

  const m = useMemo(() => {
    let prevCum = 0;
    const rows = SCHEDULE.map((s) => {
      const cumAmt = Math.round(tax * s.cum);
      const instalment = cumAmt - Math.round(tax * prevCum);
      prevCum = s.cum;
      return { by: s.by, pct: s.cum * 100, cumAmt, instalment };
    });
    const remaining = Math.max(tax - paid, 0);
    return { rows, remaining };
  }, [tax, paid]);

  const F = (label: string, value: number, set: (n: number) => void) => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">₹</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          {F("Estimated annual tax", tax, setTax)}
          {F("Advance tax already paid", paid, setPaid)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-3 font-medium">Due by</th><th className="py-2 pr-3 font-medium">Cumulative</th><th className="py-2 pr-3 font-medium text-right">Pay by this date</th><th className="py-2 font-medium text-right">This instalment</th></tr></thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.by} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.by}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.pct.toFixed(0)}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{inr(r.cumAmt)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{inr(r.instalment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-5 text-sm text-muted-foreground">
        Advance tax is due when your annual tax liability exceeds ₹10,000. Pay 15% by 15 Jun, 45% (cumulative) by 15 Sep, 75% by 15 Dec and 100% by 15 Mar. Shortfalls attract interest under sections 234B/234C. Presumptive taxpayers (44AD/44ADA) can pay 100% by 15 Mar in one go.
      </Card>
    </div>
  );
}
