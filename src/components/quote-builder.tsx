"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Printer } from "lucide-react";

type Item = { id: string; desc: string; qty: number; rate: number };
const rupee = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function QuoteBuilder() {
  const [from, setFrom] = useState({ name: "Your Company Pvt Ltd", detail: "GSTIN · Mumbai · contact@company.com" });
  const [to, setTo] = useState({ name: "Client Name", detail: "" });
  const [meta, setMeta] = useState({ no: "QT-0001", date: new Date().toISOString().slice(0, 10), validity: 15 });
  const [gst, setGst] = useState(18);
  const [notes, setNotes] = useState("50% advance, balance on delivery. Prices valid for the period above.");
  const [items, setItems] = useState<Item[]>([{ id: "1", desc: "Service / product", qty: 1, rate: 50000 }]);

  const totals = useMemo(() => {
    const sub = items.reduce((s, it) => s + it.qty * it.rate, 0);
    const tax = sub * gst / 100;
    return { sub, tax, grand: sub + tax };
  }, [items, gst]);

  function upd(id: string, f: keyof Item, v: string) { setItems((xs) => xs.map((i) => i.id === id ? { ...i, [f]: f === "desc" ? v : Number(v) } : i)); }
  function add() { setItems((xs) => [...xs, { id: Date.now() + "", desc: "Item", qty: 1, rate: 0 }]); }
  function del(id: string) { setItems((xs) => xs.filter((i) => i.id !== id)); }

  function print() {
    const rows = items.map((it) => `<tr><td>${it.desc}</td><td style="text-align:right">${it.qty}</td><td style="text-align:right">${rupee(it.rate)}</td><td style="text-align:right">${rupee(it.qty * it.rate)}</td></tr>`).join("");
    const html = `<html><head><title>${meta.no}</title><style>
      body{font-family:system-ui,Arial,sans-serif;color:#111;padding:32px;max-width:760px;margin:auto}
      h1{font-size:22px;margin:0 0 4px;color:#1f4a3b}.muted{color:#666;font-size:13px}
      .row{display:flex;justify-content:space-between;gap:24px;margin:18px 0}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
      th,td{border:1px solid #ddd;padding:8px}th{background:#f0f5f2;text-align:left}tfoot td{font-weight:bold}
    </style></head><body>
      <div class="row"><div><h1>QUOTATION</h1><div class="muted">${meta.no} · ${meta.date} · valid ${meta.validity} days</div></div></div>
      <div class="row"><div><b>${from.name}</b><div class="muted">${from.detail}</div></div><div style="text-align:right"><b>For</b><div>${to.name}</div><div class="muted">${to.detail}</div></div></div>
      <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" style="text-align:right">Subtotal</td><td style="text-align:right">${rupee(totals.sub)}</td></tr>
      <tr><td colspan="3" style="text-align:right">GST ${gst}%</td><td style="text-align:right">${rupee(totals.tax)}</td></tr>
      <tr><td colspan="3" style="text-align:right">Total</td><td style="text-align:right">${rupee(totals.grand)}</td></tr></tfoot></table>
      <p class="muted" style="margin-top:20px"><b>Terms:</b> ${notes}</p>
      <p class="muted">This is a quotation, not a tax invoice.</p>
      <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
  }

  const I = "rounded-md border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <Card className="p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2"><div className="text-sm font-medium">From</div><input className={I + " w-full"} value={from.name} onChange={(e) => setFrom({ ...from, name: e.target.value })} /><input className={I + " w-full"} value={from.detail} onChange={(e) => setFrom({ ...from, detail: e.target.value })} /></div>
        <div className="space-y-2"><div className="text-sm font-medium">To</div><input className={I + " w-full"} value={to.name} onChange={(e) => setTo({ ...to, name: e.target.value })} /><input className={I + " w-full"} placeholder="Client details" value={to.detail} onChange={(e) => setTo({ ...to, detail: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <input className={I} value={meta.no} onChange={(e) => setMeta({ ...meta, no: e.target.value })} placeholder="Quote #" />
        <input className={I} type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
        <label className="text-sm text-muted-foreground flex items-center gap-1">Valid <input className={I + " w-16"} type="number" value={meta.validity} onChange={(e) => setMeta({ ...meta, validity: Number(e.target.value) })} /> days</label>
        <label className="text-sm text-muted-foreground flex items-center gap-1">GST <input className={I + " w-16"} type="number" value={gst} onChange={(e) => setGst(Number(e.target.value))} /> %</label>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <input className={I + " flex-1"} value={it.desc} onChange={(e) => upd(it.id, "desc", e.target.value)} />
            <input className={I + " w-16"} type="number" value={it.qty} onChange={(e) => upd(it.id, "qty", e.target.value)} title="Qty" />
            <input className={I + " w-28"} type="number" value={it.rate} onChange={(e) => upd(it.id, "rate", e.target.value)} title="Rate" />
            <button onClick={() => del(it.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add line</Button>
      </div>
      <textarea className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Terms & notes" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="text-sm"><div className="text-muted-foreground">Subtotal {rupee(totals.sub)} · GST {rupee(totals.tax)}</div><div className="text-lg font-bold">Total: {rupee(totals.grand)}</div></div>
        <Button onClick={print}><Printer className="h-4 w-4" /> Preview & download PDF</Button>
      </div>
    </Card>
  );
}
