"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

type Section = { code: string; label: string; rate: number; threshold: number };

// Common India TDS sections (individual/company payee, FY-agnostic typical rates)
const SECTIONS: Section[] = [
  { code: "194C", label: "Contractor / sub-contractor (company)", rate: 2, threshold: 30000 },
  { code: "194C-ind", label: "Contractor (individual / HUF)", rate: 1, threshold: 30000 },
  { code: "194J", label: "Professional / technical fees", rate: 10, threshold: 30000 },
  { code: "194J-tech", label: "Technical services (194J)", rate: 2, threshold: 30000 },
  { code: "194I-land", label: "Rent — land / building", rate: 10, threshold: 240000 },
  { code: "194I-plant", label: "Rent — plant / machinery", rate: 2, threshold: 240000 },
  { code: "194H", label: "Commission / brokerage", rate: 5, threshold: 15000 },
  { code: "194Q", label: "Purchase of goods (over ₹50L)", rate: 0.1, threshold: 5000000 },
  { code: "194", label: "Dividend", rate: 10, threshold: 5000 },
  { code: "194A", label: "Interest (other than securities)", rate: 10, threshold: 40000 },
];

export function TdsCalc() {
  const [sec, setSec] = useState(SECTIONS[0].code);
  const [amount, setAmount] = useState(500000);
  const [hasPan, setHasPan] = useState(true);

  const m = useMemo(() => {
    const s = SECTIONS.find((x) => x.code === sec)!;
    const applies = amount >= s.threshold;
    const rate = hasPan ? s.rate : Math.max(s.rate, 20); // no PAN → 20% (194Q etc. min 20%/5%)
    const tds = applies ? Math.round(amount * rate / 100) : 0;
    return { s, applies, rate, tds, net: amount - tds };
  }, [sec, amount, hasPan]);

  const I = "rounded-md border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 space-y-4">
        <label className="block"><span className="text-sm text-muted-foreground">Nature of payment (section)</span>
          <select className={I + " w-full mt-1"} value={sec} onChange={(e) => setSec(e.target.value)}>
            {SECTIONS.map((s) => <option key={s.code} value={s.code}>{s.code.split("-")[0]} · {s.label}</option>)}
          </select></label>
        <label className="block"><span className="text-sm text-muted-foreground">Payment amount</span>
          <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">₹</span>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasPan} onChange={(e) => setHasPan(e.target.checked)} className="h-4 w-4" /> Payee has furnished PAN</label>

        <div className="grid grid-cols-3 gap-3 pt-1">
          <Stat label="TDS rate" value={`${m.rate}%`} />
          <Stat label="TDS to deduct" value={inr(m.tds)} highlight />
          <Stat label="Net payable" value={inr(m.net)} />
        </div>
        {!m.applies && <p className="text-xs text-warning">Below the ₹{m.s.threshold.toLocaleString("en-IN")} threshold for {m.s.code.split("-")[0]} — no TDS is required on this single payment (watch aggregate limits).</p>}
        {!hasPan && <p className="text-xs text-danger">No PAN → Section 206AA applies a higher rate (min 20%).</p>}
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-2">Common TDS rates</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 font-medium">Section</th><th className="py-2 font-medium">Payment</th><th className="py-2 font-medium text-right">Rate</th></tr></thead>
          <tbody>{SECTIONS.map((s) => (
            <tr key={s.code} className="border-b last:border-0"><td className="py-1.5 font-medium">{s.code.split("-")[0]}</td><td className="py-1.5 text-muted-foreground">{s.label}</td><td className="py-1.5 text-right">{s.rate}%</td></tr>
          ))}</tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-3">Rates are indicative for resident payees. Surcharge/cess, lower-deduction certificates, and special cases can change the effective rate — confirm with your CA before filing.</p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
