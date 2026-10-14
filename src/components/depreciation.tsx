"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function Depreciation() {
  const [cost, setCost] = useState(1_000_000);
  const [salvage, setSalvage] = useState(50_000);
  const [life, setLife] = useState(5);
  const [rate, setRate] = useState(25);
  const [method, setMethod] = useState<"slm" | "wdv">("wdv");

  const rows = useMemo(() => {
    const out: { year: number; open: number; dep: number; close: number }[] = [];
    /* Guards: a salvage above cost made every year's depreciation negative, and a
       zero or fractional life divided by zero. Salvage is held inside [0, cost],
       life to whole years from 1 to 100, the WDV rate to 0–100%. */
    const c = Math.max(0, cost || 0);
    const sv = Math.min(Math.max(0, salvage || 0), c);
    const n = Math.min(100, Math.max(1, Math.floor(life || 1)));
    const r = Math.min(100, Math.max(0, rate || 0));
    let book = c;
    for (let y = 1; y <= n; y++) {
      let dep: number;
      if (method === "slm") dep = (c - sv) / n;
      else dep = book * (r / 100);
      dep = Math.max(0, Math.min(dep, book - sv));
      const open = book; book = Math.max(sv, book - dep);
      out.push({ year: y, open, dep, close: book });
    }
    return out;
  }, [cost, salvage, life, rate, method]);

  const totalDep = rows.reduce((s, r) => s + r.dep, 0);
  const max = Math.max(...rows.map((r) => r.open), 1);
  const F = (label: string, value: number, set: (n: number) => void, suffix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring">
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /><span className="text-xs text-muted-foreground">{suffix}</span>
      </div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {F("Asset cost", cost, setCost)}
          {F("Salvage value", salvage, setSalvage)}
          {F("Useful life", life, setLife, "yr")}
          <label className="block"><span className="text-sm text-muted-foreground">Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as any)} className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="wdv">Written-down value (WDV)</option><option value="slm">Straight-line (SLM)</option>
            </select></label>
          {method === "wdv" && F("WDV rate", rate, setRate, "%")}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between"><div className="font-semibold">Depreciation schedule</div><div className="text-sm text-muted-foreground">Total depreciated: <b className="text-foreground">{inr(totalDep)}</b></div></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-4 font-medium">Year</th><th className="py-2 pr-4 font-medium">Opening</th><th className="py-2 pr-4 font-medium">Depreciation</th><th className="py-2 pr-4 font-medium">Closing (book value)</th><th className="py-2 font-medium"></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-b last:border-0">
                  <td className="py-1.5 pr-4">{r.year}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{inr(r.open)}</td>
                  <td className="py-1.5 pr-4 text-danger">{inr(r.dep)}</td>
                  <td className="py-1.5 pr-4 font-medium">{inr(r.close)}</td>
                  <td className="py-1.5 w-1/3"><div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full brand-gradient" style={{ width: `${(r.close / max) * 100}%` }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {salvage > cost && <p className="text-xs text-warning">Salvage value is above the asset cost, so it is treated as equal to cost — nothing to depreciate.</p>}
        <p className="text-xs text-muted-foreground">WDV front-loads depreciation (bigger tax shield early); SLM spreads it evenly. Indian companies commonly use WDV under the Income Tax Act. Confirm the correct rate/block with your CA.</p>
      </Card>
    </div>
  );
}
