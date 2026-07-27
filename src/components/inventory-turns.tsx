"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function InventoryTurns() {
  const [cogs, setCogs] = useState(24_000_000);
  const [avgInventory, setAvgInventory] = useState(4_000_000);
  const [carryPct, setCarryPct] = useState(22);

  const m = useMemo(() => {
    const turns = avgInventory > 0 ? cogs / avgInventory : 0;
    const dio = turns > 0 ? 365 / turns : Infinity;
    const carryCost = avgInventory * (carryPct / 100);
    const tone = turns >= 8 ? "up" : turns >= 4 ? "flat" : "down";
    return { turns, dio, carryCost, tone };
  }, [cogs, avgInventory, carryPct]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          {F("Annual COGS", cogs, setCogs)}
          {F("Average inventory value", avgInventory, setAvgInventory)}
          {F("Carrying cost / year", carryPct, setCarryPct, "%")}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Inventory turns / year" value={`${m.turns.toFixed(1)}×`} cls={m.tone === "up" ? "text-success" : m.tone === "down" ? "text-danger" : "text-warning"} highlight />
          <Stat label="Days inventory (DIO)" value={m.dio === Infinity ? "—" : `${m.dio.toFixed(0)} days`} />
          <Stat label="Annual holding cost" value={inr(m.carryCost)} />
        </div>
      </Card>
      <Card className="p-5 text-sm">
        <div className="font-semibold mb-1">What it means</div>
        <p className="text-muted-foreground">
          You sell through your stock <b>{m.turns.toFixed(1)} times a year</b> — roughly every {m.dio === Infinity ? "—" : Math.round(m.dio)} days.
          Carrying cost (storage, insurance, spoilage, tied-up capital) runs about {inr(m.carryCost)} a year.
          {m.tone === "down" && " Turns under 4× usually mean overstocking — trimming average inventory frees cash and cuts this holding cost directly."}
          {m.tone === "up" && " Turns of 8×+ are lean — just watch that you're not stocking out and losing sales."}
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
