"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

// India GST input-tax-credit set-off order (post-2019 Rule 88A):
//  IGST credit → IGST, then CGST, then SGST liability
//  CGST credit → CGST, then IGST (never SGST)
//  SGST credit → SGST, then IGST (never CGST)
function setOff(liab: { igst: number; cgst: number; sgst: number }, cr: { igst: number; cgst: number; sgst: number }) {
  const l = { ...liab }, c = { ...cr };
  const apply = (head: "igst" | "cgst" | "sgst", from: "igst" | "cgst" | "sgst") => {
    const used = Math.min(l[head], c[from]);
    l[head] -= used; c[from] -= used;
  };
  apply("igst", "igst"); apply("cgst", "igst"); apply("sgst", "igst");
  apply("cgst", "cgst"); apply("igst", "cgst");
  apply("sgst", "sgst"); apply("igst", "sgst");
  return { cash: l, carry: c };
}

export function ItcSetoff() {
  const [liab, setLiab] = useState({ igst: 120000, cgst: 90000, sgst: 90000 });
  const [cr, setCr] = useState({ igst: 150000, cgst: 60000, sgst: 60000 });

  const m = useMemo(() => {
    const { cash, carry } = setOff(liab, cr);
    const totalCash = cash.igst + cash.cgst + cash.sgst;
    const totalCarry = carry.igst + carry.cgst + carry.sgst;
    const totalLiab = liab.igst + liab.cgst + liab.sgst;
    return { cash, carry, totalCash, totalCarry, totalLiab };
  }, [liab, cr]);

  const N = (v: number, set: (n: number) => void) => (
    <div className="flex items-center gap-1 rounded-lg border bg-background px-2 h-9 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">₹</span>
      <input type="number" value={v} onChange={(e) => set(Number(e.target.value))} className="w-full bg-transparent text-sm outline-none" /></div>
  );

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <div className="font-semibold">Output tax (liability)</div>
          <label className="text-sm text-muted-foreground block">IGST{N(liab.igst, (n) => setLiab({ ...liab, igst: n }))}</label>
          <label className="text-sm text-muted-foreground block">CGST{N(liab.cgst, (n) => setLiab({ ...liab, cgst: n }))}</label>
          <label className="text-sm text-muted-foreground block">SGST{N(liab.sgst, (n) => setLiab({ ...liab, sgst: n }))}</label>
        </Card>
        <Card className="p-5 space-y-3">
          <div className="font-semibold">Input credit (ITC available)</div>
          <label className="text-sm text-muted-foreground block">IGST{N(cr.igst, (n) => setCr({ ...cr, igst: n }))}</label>
          <label className="text-sm text-muted-foreground block">CGST{N(cr.cgst, (n) => setCr({ ...cr, cgst: n }))}</label>
          <label className="text-sm text-muted-foreground block">SGST{N(cr.sgst, (n) => setCr({ ...cr, sgst: n }))}</label>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total liability" value={inr(m.totalLiab)} />
        <Stat label="Cash to pay" value={inr(m.totalCash)} highlight cls={m.totalCash > 0 ? "" : "text-success"} />
        <Stat label="Credit carried forward" value={inr(m.totalCarry)} cls={m.totalCarry > 0 ? "text-success" : ""} />
        <Stat label="Covered by ITC" value={m.totalLiab ? `${(((m.totalLiab - m.totalCash) / m.totalLiab) * 100).toFixed(0)}%` : "—"} />
      </div>

      <Card className="p-5">
        <div className="font-semibold mb-2">Cash payable, by head (after set-off)</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 font-medium">Head</th><th className="py-2 font-medium text-right">Cash payable</th><th className="py-2 font-medium text-right">ITC carried fwd</th></tr></thead>
          <tbody>
            {(["igst", "cgst", "sgst"] as const).map((h) => (
              <tr key={h} className="border-b last:border-0"><td className="py-1.5 uppercase">{h}</td><td className="py-1.5 text-right tabular-nums">{inr(m.cash[h])}</td><td className="py-1.5 text-right tabular-nums text-muted-foreground">{inr(m.carry[h])}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-3">Follows the standard set-off order (IGST credit first, then CGST/SGST against their own heads). CGST and SGST credit can never offset each other. Confirm final figures on the GST portal before filing GSTR-3B.</p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
