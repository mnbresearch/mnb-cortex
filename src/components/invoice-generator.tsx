"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Printer } from "lucide-react";

type Item = { id: string; desc: string; qty: number; rate: number; gst: number };
const rupee = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function InvoiceGenerator() {
  const [seller, setSeller] = useState({ name: "Your Company Pvt Ltd", gstin: "27ABCDE1234F1Z5", addr: "Mumbai, Maharashtra" });
  const [buyer, setBuyer] = useState({ name: "Customer Name", gstin: "", addr: "" });
  const [meta, setMeta] = useState({ no: "INV-0001", date: new Date().toISOString().slice(0, 10) });
  const [intraState, setIntraState] = useState(true);
  const [items, setItems] = useState<Item[]>([{ id: "1", desc: "Product / service", qty: 1, rate: 1000, gst: 18 }]);

  const totals = useMemo(() => {
    let sub = 0, tax = 0;
    for (const it of items) { const amt = it.qty * it.rate; sub += amt; tax += amt * it.gst / 100; }
    return { sub, tax, grand: sub + tax };
  }, [items]);

  function upd(id: string, f: keyof Item, v: string) { setItems((xs) => xs.map((i) => i.id === id ? { ...i, [f]: f === "desc" ? v : Number(v) } : i)); }
  function add() { setItems((xs) => [...xs, { id: Date.now() + "", desc: "Item", qty: 1, rate: 0, gst: 18 }]); }
  function del(id: string) { setItems((xs) => xs.filter((i) => i.id !== id)); }

  function print() {
    const rows = items.map((it) => { const amt = it.qty * it.rate; return `<tr><td>${it.desc}</td><td style="text-align:right">${it.qty}</td><td style="text-align:right">${rupee(it.rate)}</td><td style="text-align:right">${it.gst}%</td><td style="text-align:right">${rupee(amt)}</td></tr>`; }).join("");
    const taxRows = intraState
      ? `<tr><td colspan="4" style="text-align:right">CGST</td><td style="text-align:right">${rupee(totals.tax / 2)}</td></tr><tr><td colspan="4" style="text-align:right">SGST</td><td style="text-align:right">${rupee(totals.tax / 2)}</td></tr>`
      : `<tr><td colspan="4" style="text-align:right">IGST</td><td style="text-align:right">${rupee(totals.tax)}</td></tr>`;
    const html = `<html><head><title>${meta.no}</title><style>
      body{font-family:system-ui,Arial,sans-serif;color:#111;padding:32px;max-width:760px;margin:auto}
      h1{font-size:22px;margin:0 0 4px} .muted{color:#666;font-size:13px}
      .row{display:flex;justify-content:space-between;gap:24px;margin:18px 0}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
      th,td{border:1px solid #ddd;padding:8px}
      th{background:#f5f5f5;text-align:left} tfoot td{font-weight:bold}
    </style></head><body>
      <div class="row"><div><h1>TAX INVOICE</h1><div class="muted">${meta.no} · ${meta.date}</div></div></div>
      <div class="row">
        <div><b>${seller.name}</b><div class="muted">${seller.addr}</div><div class="muted">GSTIN: ${seller.gstin}</div></div>
        <div style="text-align:right"><b>Bill to</b><div>${buyer.name}</div><div class="muted">${buyer.addr}</div><div class="muted">${buyer.gstin ? "GSTIN: " + buyer.gstin : ""}</div></div>
      </div>
      <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">GST</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="4" style="text-align:right">Subtotal</td><td style="text-align:right">${rupee(totals.sub)}</td></tr>
        ${taxRows}
        <tr><td colspan="4" style="text-align:right">Grand total</td><td style="text-align:right">${rupee(totals.grand)}</td></tr>
      </tfoot></table>
      <p class="muted" style="margin-top:24px">This is a computer-generated invoice.</p>
      <script>window.onload=()=>window.print()</script>
    </body></html>`;
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
  }

  const I = "rounded-md border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <Card className="p-5 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">Seller</div>
          <input className={I + " w-full"} value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} placeholder="Your company" />
          <input className={I + " w-full"} value={seller.gstin} onChange={(e) => setSeller({ ...seller, gstin: e.target.value })} placeholder="GSTIN" />
          <input className={I + " w-full"} value={seller.addr} onChange={(e) => setSeller({ ...seller, addr: e.target.value })} placeholder="Address / state" />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Buyer</div>
          <input className={I + " w-full"} value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} placeholder="Customer name" />
          <input className={I + " w-full"} value={buyer.gstin} onChange={(e) => setBuyer({ ...buyer, gstin: e.target.value })} placeholder="GSTIN (optional)" />
          <input className={I + " w-full"} value={buyer.addr} onChange={(e) => setBuyer({ ...buyer, addr: e.target.value })} placeholder="Address / state" />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <input className={I} value={meta.no} onChange={(e) => setMeta({ ...meta, no: e.target.value })} placeholder="Invoice #" />
        <input className={I} type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={intraState} onChange={(e) => setIntraState(e.target.checked)} /> Same-state (CGST+SGST)</label>
      </div>

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <input className={I + " flex-1"} value={it.desc} onChange={(e) => upd(it.id, "desc", e.target.value)} />
            <input className={I + " w-16"} type="number" value={it.qty} onChange={(e) => upd(it.id, "qty", e.target.value)} title="Qty" />
            <input className={I + " w-24"} type="number" value={it.rate} onChange={(e) => upd(it.id, "rate", e.target.value)} title="Rate" />
            <input className={I + " w-16"} type="number" value={it.gst} onChange={(e) => upd(it.id, "gst", e.target.value)} title="GST %" />
            <button onClick={() => del(it.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add item</Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="text-sm space-y-0.5">
          <div className="text-muted-foreground">Subtotal: <b className="text-foreground">{rupee(totals.sub)}</b></div>
          <div className="text-muted-foreground">GST: <b className="text-foreground">{rupee(totals.tax)}</b></div>
          <div className="text-lg font-bold">Total: {rupee(totals.grand)}</div>
        </div>
        <Button onClick={print}><Printer className="h-4 w-4" /> Preview & download PDF</Button>
      </div>
    </Card>
  );
}
