"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function GstLateFee() {
  const [taxDue, setTaxDue] = useState(120000);
  const [days, setDays] = useState(20);
  const [nil, setNil] = useState(false);

  const m = useMemo(() => {
    // GSTR-3B late fee: ₹50/day (₹25 CGST + ₹25 SGST) for regular; ₹20/day for nil.
    const perDay = nil ? 20 : 50;
    const rawFee = perDay * Math.max(days, 0);
    // Cap: commonly ₹5,000 per Act side (₹10,000 total) for older periods; ₹500/₹1,000 for reduced. Use ₹10,000 overall cap.
    const lateFee = Math.min(rawFee, 10000);
    // Interest @ 18% p.a. on tax paid late (nil returns have no tax).
    const interest = nil ? 0 : Math.round(taxDue * 0.18 * (Math.max(days, 0) / 365));
    const total = lateFee + interest + (nil ? 0 : taxDue);
    return { perDay, lateFee, interest, total, capped: rawFee > lateFee };
  }, [taxDue, days, nil]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {F("Tax payable", taxDue, setTaxDue)}
          {F("Days late", days, setDays, "#")}
          <label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={nil} onChange={(e) => setNil(e.target.checked)} className="h-4 w-4" /> Nil return (no tax)</label>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Late fee / day" value={`₹${m.perDay}`} />
          <Stat label="Late fee" value={inr(m.lateFee)} cls={m.capped ? "text-warning" : ""} />
          <Stat label="Interest (18% p.a.)" value={inr(m.interest)} />
          <Stat label="Total to pay" value={inr(m.total)} highlight />
        </div>
        {m.capped && <p className="text-xs text-warning">Late fee capped at the statutory maximum.</p>}
      </Card>
      <Card className="p-5 text-sm text-muted-foreground">
        GSTR-3B late fee is ₹50/day (₹25 CGST + ₹25 SGST), or ₹20/day for nil returns, subject to statutory caps. Interest runs at 18% p.a. on the tax paid late. Reduced-fee schemes and period-specific caps can change this — confirm the exact figure on the GST portal before paying.
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
