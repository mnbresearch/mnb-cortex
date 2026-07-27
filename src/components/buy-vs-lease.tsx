"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function BuyVsLease() {
  const [cost, setCost] = useState(2_000_000);
  const [salvage, setSalvage] = useState(300_000);
  const [life, setLife] = useState(5);
  const [rate, setRate] = useState(11);
  const [leaseMonthly, setLeaseMonthly] = useState(42000);

  const m = useMemo(() => {
    const years = life;
    const r = rate / 100;
    // Buy: pay cost now, receive salvage at end (discounted)
    const pvSalvage = salvage / Math.pow(1 + r, years);
    const buyNpv = cost - pvSalvage;
    // Lease: monthly payments discounted (annuity, monthly rate)
    const mr = r / 12;
    const n = years * 12;
    const pvLease = mr === 0 ? leaseMonthly * n : leaseMonthly * (1 - Math.pow(1 + mr, -n)) / mr;
    const cheaper = buyNpv <= pvLease ? "Buy" : "Lease";
    const saving = Math.abs(buyNpv - pvLease);
    return { buyNpv, pvLease, pvSalvage, cheaper, saving };
  }, [cost, salvage, life, rate, leaseMonthly]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {F("Asset cost (buy)", cost, setCost)}
          {F("Resale / salvage value", salvage, setSalvage)}
          {F("Useful life", life, setLife, "yrs")}
          {F("Discount rate (cost of capital)", rate, setRate, "%")}
          {F("Lease payment / month", leaseMonthly, setLeaseMonthly)}
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card className={`p-5 ${m.cheaper === "Buy" ? "border-primary/40 bg-primary/5" : ""}`}>
          <div className="text-sm text-muted-foreground">Buy — present-value cost</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{inr(m.buyNpv)}</div>
          <div className="text-xs text-muted-foreground mt-1">Cost {inr(cost)} − PV of salvage {inr(m.pvSalvage)}</div>
        </Card>
        <Card className={`p-5 ${m.cheaper === "Lease" ? "border-primary/40 bg-primary/5" : ""}`}>
          <div className="text-sm text-muted-foreground">Lease — present-value cost</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{inr(m.pvLease)}</div>
          <div className="text-xs text-muted-foreground mt-1">{inr(leaseMonthly)}/mo for {life * 12} months, discounted</div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-sm"><b className="text-primary">{m.cheaper}</b> is cheaper in present-value terms by <b>{inr(m.saving)}</b> over {life} years.</div>
        <p className="text-xs text-muted-foreground mt-2">This compares pure cost of capital. Leasing also preserves cash and can be off-balance-sheet; buying builds an asset and captures depreciation tax shield. Factor those in before deciding.</p>
      </Card>
    </div>
  );
}
