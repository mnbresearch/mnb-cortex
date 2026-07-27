"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function CashRunway() {
  const [cash, setCash] = useState(8_000_000);
  const [burn, setBurn] = useState(2_200_000);
  const [revenue, setRevenue] = useState(1_400_000);
  const [growth, setGrowth] = useState(6);

  const m = useMemo(() => {
    let bal = cash, rev = revenue, month = 0;
    const series: number[] = [bal];
    // simulate up to 60 months
    while (bal > 0 && month < 60) {
      month++;
      const net = burn - rev; // positive = losing money
      bal -= net;
      rev = rev * (1 + growth / 100);
      series.push(Math.max(bal, 0));
      if (net <= 0) break; // cash-flow positive → runway is effectively infinite
    }
    const netBurn = burn - revenue;
    const profitable = netBurn <= 0;
    const runway = profitable ? Infinity : month >= 60 ? 60 : month;
    const zeroDate = profitable ? null : (() => {
      const d = new Date(); d.setMonth(d.getMonth() + runway);
      return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    })();
    return { netBurn, profitable, runway, zeroDate, series };
  }, [cash, burn, revenue, growth]);

  const max = Math.max(...m.series, 1);
  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {F("Cash in bank", cash, setCash)}
          {F("Monthly gross burn", burn, setBurn)}
          {F("Monthly revenue", revenue, setRevenue)}
          {F("Revenue growth /mo", growth, setGrowth, "%")}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Net burn / month" value={m.profitable ? "Cash positive" : inr(m.netBurn)} cls={m.profitable ? "text-success" : "text-danger"} />
          <Stat label="Runway" value={m.profitable ? "∞" : m.runway >= 60 ? "60+ months" : `${m.runway} months`} highlight />
          <Stat label="Out of cash" value={m.zeroDate ?? "Never (at this rate)"} cls={m.profitable ? "text-success" : ""} />
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">Projected cash balance</div>
        <div className="flex items-end gap-1 h-40">
          {m.series.map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-primary/70 min-w-[3px]" style={{ height: `${(v / max) * 100}%` }} title={`Month ${i}: ${inr(v)}`} />
          ))}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {m.profitable
            ? "You're cash-flow positive — the balance grows rather than depletes. Keep an eye on collection timing so book profit turns into real cash."
            : "Each bar is a month. When it hits zero you need fresh cash or profitability. Rule of thumb: start raising or cutting when runway falls under 6 months."}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
