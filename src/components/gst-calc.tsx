"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function GstCalc() {
  const [amount, setAmount] = useState(10000);
  const [rate, setRate] = useState(18);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [intra, setIntra] = useState(true);

  const m = useMemo(() => {
    let base: number, gst: number, total: number;
    if (mode === "add") { base = amount; gst = amount * (rate / 100); total = base + gst; }
    else { total = amount; base = amount / (1 + rate / 100); gst = total - base; }
    return { base, gst, total, cgst: gst / 2, sgst: gst / 2, igst: gst };
  }, [amount, rate, mode]);

  /*
    GST 2.0 slabs, effective 22 September 2025. 12% and 28% were abolished —
    12% items moved mostly to 5%, 28% to 18% — and 40% was added for demerit
    goods (tobacco, sugary aerated drinks, luxury vehicles).

    This calculator was still offering 12% and 28%. Someone pricing an invoice
    with it would have charged a rate that no longer exists, on a real invoice.
    Re-check after each GST Council meeting; see the note in app/(app)/gst/page.
  */
  const RATES = [0, 5, 18, 40];
  const S = "rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <Card className="p-5 space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-muted-foreground block mb-1">{mode === "add" ? "Amount (excl. GST)" : "Amount (incl. GST)"}</span>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={S + " w-40"} />
        </label>
        <label className="text-sm"><span className="text-muted-foreground block mb-1">GST rate</span>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className={S}>{RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></label>
        <label className="text-sm"><span className="text-muted-foreground block mb-1">Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className={S}><option value="add">Add GST</option><option value="remove">Remove GST</option></select></label>
        <label className="text-sm flex items-center gap-2 mt-6"><input type="checkbox" checked={intra} onChange={(e) => setIntra(e.target.checked)} /> Same-state (CGST+SGST)</label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Base amount" value={inr(m.base)} />
        <Stat label="GST" value={inr(m.gst)} cls="text-primary" />
        <Stat label={intra ? "CGST + SGST" : "IGST"} value={intra ? `${inr(m.cgst)} + ${inr(m.sgst)}` : inr(m.igst)} />
        <Stat label="Total" value={inr(m.total)} highlight />
      </div>

      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        {mode === "add"
          ? <>Adding {rate}% GST to {inr(m.base)} gives <b className="text-foreground">{inr(m.total)}</b> — of which <b className="text-foreground">{inr(m.gst)}</b> is tax{intra ? `, split ${inr(m.cgst)} CGST + ${inr(m.sgst)} SGST.` : ` as IGST.`}</>
          : <>{inr(m.total)} already includes {rate}% GST — the pre-tax value is <b className="text-foreground">{inr(m.base)}</b> and the tax component is <b className="text-foreground">{inr(m.gst)}</b>.</>}
      </div>
    </Card>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
