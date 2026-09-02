"use client";
import { useMemo, useState } from "react";
import { saveInvoice, type SavedInvoice } from "@/lib/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Printer, Save, Check, Loader2, AlertCircle } from "lucide-react";

type Item = { id: string; desc: string; qty: number; rate: number; gst: number };
const rupee = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * The invoice generator — now a record, not just a printout.
 *
 * It previously held everything in React state and called window.print(). The
 * document existed until the tab closed, while receivables ageing, DSO, the
 * cash conversion cycle, 13-week cash and the collections chase all read the
 * `invoices` table and stayed empty for anyone billing here. The one weekly
 * habit an owner already has was being thrown away.
 *
 * `saved` is fetched on the server and passed in so the list is populated in
 * the first paint and reflects the workspace, not this browser.
 */
export function InvoiceGenerator({ saved = [] }: { saved?: SavedInvoice[] }) {
  const [seller, setSeller] = useState({ name: "Your Company Pvt Ltd", gstin: "27ABCDE1234F1Z5", addr: "Mumbai, Maharashtra" });
  const [buyer, setBuyer] = useState({ name: "Customer Name", gstin: "", addr: "" });
  const [meta, setMeta] = useState({ no: "INV-0001", date: new Date().toISOString().slice(0, 10) });
  const [intraState, setIntraState] = useState(true);
  const [items, setItems] = useState<Item[]>([{ id: "1", desc: "Product / service", qty: 1, rate: 1000, gst: 18 }]);
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const totals = useMemo(() => {
    let sub = 0, tax = 0;
    for (const it of items) { const amt = it.qty * it.rate; sub += amt; tax += amt * it.gst / 100; }
    return { sub, tax, grand: sub + tax };
  }, [items]);

  function upd(id: string, f: keyof Item, v: string) { setItems((xs) => xs.map((i) => i.id === id ? { ...i, [f]: f === "desc" ? v : Number(v) } : i)); }
  function add() { setItems((xs) => [...xs, { id: Date.now() + "", desc: "Item", qty: 1, rate: 0, gst: 18 }]); }
  function del(id: string) { setItems((xs) => xs.filter((i) => i.id !== id)); }

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await saveInvoice({
        invoice_no: meta.no,
        party: buyer.name,
        amount: totals.grand,
        issue_date: meta.date || null,
        due_date: due || null,
        status: "pending",
        /*
          The whole document, so this invoice can be reopened and reprinted
          identically months later. Saving only the total would still leave the
          owner rebuilding it by hand for a customer who lost their copy.
        */
        meta: { seller, buyer, items, intraState, subtotal: totals.sub, tax: totals.tax },
      });
      setSaveMsg(res.ok
        ? { ok: true, text: `Saved. ${meta.no} now appears in Receivables and counts towards your DSO.` }
        : { ok: false, text: res.error || "Could not save." });
    } catch {
      setSaveMsg({ ok: false, text: "Could not reach the server. Your invoice is still on screen." });
    } finally { setSaving(false); }
  }

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
        <label className="text-sm flex items-center gap-1.5"><span className="text-muted-foreground">Issued</span>
          <input className={I} type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></label>
        {/* Due date drives receivables ageing and DSO. Without it a saved
            invoice cannot age, so it is asked for here rather than inferred. */}
        <label className="text-sm flex items-center gap-1.5"><span className="text-muted-foreground">Due</span>
          <input className={I} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={print}><Printer className="h-4 w-4" /> Preview &amp; download PDF</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save to workspace"}
          </Button>
        </div>
      </div>

      {saveMsg && (
        <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${saveMsg.ok ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20"}`}>
          {saveMsg.ok ? <Check className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{saveMsg.text}</span>
        </div>
      )}

      {saved.length > 0 && (
        <div className="border-t pt-4">
          <div className="text-sm font-medium mb-2">Saved invoices</div>
          <div className="divide-y">
            {saved.slice(0, 8).map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{v.invoice_no || "—"}</span>
                  <span className="text-muted-foreground"> · {v.party || "—"}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="tabular-nums">{rupee(v.amount)}</span>
                  <span className={`text-xs rounded-full border px-2 py-0.5 ${v.status === "paid" ? "bg-success/10 text-success border-success/20" : "text-muted-foreground"}`}>{v.status || "pending"}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Saving an invoice is what makes Receivables, DSO and the 13-week cash forecast reflect your real position.
          </p>
        </div>
      )}
    </Card>
  );
}
