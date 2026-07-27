"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function SipCalc() {
  const [mode, setMode] = useState<"sip" | "lumpsum">("sip");
  const [amount, setAmount] = useState(25000);
  const [ret, setRet] = useState(12);
  const [years, setYears] = useState(10);

  const m = useMemo(() => {
    const n = years * 12;
    const i = ret / 100 / 12;
    let invested: number, future: number;
    const series: number[] = [];
    if (mode === "sip") {
      invested = amount * n;
      future = i === 0 ? amount * n : amount * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
      for (let y = 1; y <= years; y++) { const nn = y * 12; series.push(i === 0 ? amount * nn : amount * ((Math.pow(1 + i, nn) - 1) / i) * (1 + i)); }
    } else {
      invested = amount;
      future = amount * Math.pow(1 + ret / 100, years);
      for (let y = 1; y <= years; y++) series.push(amount * Math.pow(1 + ret / 100, y));
    }
    return { invested, future, gains: future - invested, series };
  }, [mode, amount, ret, years]);

  const max = Math.max(...m.series, 1);
  const F = (label: string, value: number, set: (n: number) => void, suffix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{suffix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <Card className="p-5 space-y-5">
      <div className="flex gap-1 rounded-lg border p-1 w-fit text-sm">
        <button onClick={() => setMode("sip")} className={`px-4 py-1.5 rounded-md ${mode === "sip" ? "brand-gradient text-white" : "text-muted-foreground"}`}>Monthly SIP</button>
        <button onClick={() => setMode("lumpsum")} className={`px-4 py-1.5 rounded-md ${mode === "lumpsum" ? "brand-gradient text-white" : "text-muted-foreground"}`}>Lump sum</button>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {F(mode === "sip" ? "Monthly investment" : "One-time investment", amount, setAmount)}
        {F("Expected return (annual)", ret, setRet, "%")}
        {F("Duration", years, setYears, "yr")}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Invested" value={inr(m.invested)} />
        <Stat label="Estimated gains" value={inr(m.gains)} cls="text-success" />
        <Stat label="Final value" value={inr(m.future)} highlight />
      </div>
      <div>
        <div className="text-sm text-muted-foreground mb-2">Growth over time</div>
        <div className="flex items-end gap-1 h-28">
          {m.series.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t brand-gradient" style={{ height: `${(v / max) * 100}%` }} title={inr(v)} />
              <span className="text-[9px] text-muted-foreground">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Assumes a constant annual return — real markets fluctuate. Returns are estimates, not guarantees.</p>
    </Card>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
