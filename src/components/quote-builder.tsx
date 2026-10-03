"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveQuote, setQuoteStatus, convertQuoteToInvoice } from "@/lib/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Printer, Save, Check, Loader2, AlertCircle, FileOutput } from "lucide-react";
import { gstRateWarning } from "@/lib/gst-rates";
import { escapeHtml as h } from "@/lib/utils";

type Item = { id: string; desc: string; qty: number; rate: number };
const rupee = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Quotes, now kept.
 *
 * Same problem as the invoice generator: state plus window.print(), so the
 * quote vanished with the tab and nothing could ever ask "which quotes did we
 * send and which came back?".
 *
 * Quotes are stored in their own table, NOT in `invoices`. A quote is not money
 * owed, and putting one in the receivables table with a special status is how a
 * pipeline number ends up inside a cash forecast.
 */
export function QuoteBuilder({ saved = [], orgName = null }: { saved?: any[]; orgName?: string | null }) {
  const router = useRouter();
  const [quoteMsg, setQuoteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [, startTransition] = useTransition();

  function act(id: string, run: () => Promise<any>) {
    setBusyId(id); setQuoteMsg(null);
    startTransition(async () => {
      try {
        const r = await run();
        /* Server actions here RETURN their recoverable failures rather than
           throwing (lib/action-result.ts), so `r` is the message either way. */
        if (r && r.ok === false) setQuoteMsg({ ok: false, text: r.error });
        else setQuoteMsg({ ok: true, text: r?.message || "Updated." });
      } catch {
        setQuoteMsg({ ok: false, text: "That didn't go through. Check your connection and try again." });
      } finally { setBusyId(""); }
    });
  }

  function QuoteStatus({ status, converted }: { status?: string; converted?: boolean }) {
    const s = String(status || "open");
    const tone = s === "accepted" ? "bg-success/10 text-success border-success/20"
      : s === "declined" ? "bg-danger/10 text-danger border-danger/20"
      : s === "expired" ? "bg-muted text-muted-foreground border-border"
      : "bg-warning/10 text-warning border-warning/20";
    return (
      <span className="ml-2 inline-flex items-center gap-1.5 align-middle">
        <Badge className={tone}>{s}</Badge>
        {converted && <span className="text-xs text-muted-foreground">· invoiced</span>}
      </span>
    );
  }

  function QuoteActions({ quote }: { quote: any }) {
    const converted = Boolean(quote.meta?.converted_invoice_id);
    const busy = busyId === quote.id;
    const mark = (status: string) => () => {
      const fd = new FormData(); fd.set("id", quote.id); fd.set("status", status);
      act(quote.id, () => setQuoteStatus(fd));
    };
    return (
      <div className="flex items-center gap-1.5">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Working" />}
        {String(quote.status || "open") !== "accepted" && (
          <Button variant="outline" size="sm" onClick={mark("accepted")} disabled={busy}>Won</Button>
        )}
        {String(quote.status || "open") !== "declined" && (
          <Button variant="outline" size="sm" onClick={mark("declined")} disabled={busy}>Lost</Button>
        )}
        {/*
          Conversion is its own button and is offered once. Doing it twice puts
          the amount into receivables twice, which inflates the cash forecast,
          the MSME exposure and every KPI built on invoices — so the server
          refuses as well, and this only hides a button the owner would
          otherwise press and be told off for.
        */}
        {!converted ? (
          <Button size="sm" onClick={() => {
            const fd = new FormData(); fd.set("id", quote.id);
            act(quote.id, () => convertQuoteToInvoice(fd));
          }} disabled={busy}>
            <FileOutput className="h-4 w-4" /> Invoice it
          </Button>
        ) : (
          <span className="text-xs text-success inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Invoiced</span>
        )}
      </div>
    );
  }

  /*
    PLACEHOLDER TEXT MUST NOT BE A VALUE.

    These four fields opened pre-filled with "Your Company Pvt Ltd",
    "GSTIN · Mumbai · contact@company.com", "Client Name" and
    "Service / product" as their VALUES. They read as placeholders and
    behave as data: nothing clears on focus, and saveQuote accepted them
    without complaint. A quotation addressed to a customer called "Client
    Name", for one line item called "Service / product", saved cleanly —
    and `Invoice it` then turned it into a real receivable carrying that
    name, which flows into DSO, the ageing buckets and the collections
    chase-first list.

    The seller is now the workspace's real name, which the product has
    known since signup. Everything else is a true placeholder, and save
    refuses to proceed until the buyer is named.
  */
  const [from, setFrom] = useState({ name: orgName || "", detail: "" });
  const [to, setTo] = useState({ name: "", detail: "" });
  const [meta, setMeta] = useState({ no: "QT-0001", date: new Date().toISOString().slice(0, 10), validity: 15 });
  const [gst, setGst] = useState(18);
  const [notes, setNotes] = useState("50% advance, balance on delivery. Prices valid for the period above.");
  const [items, setItems] = useState<Item[]>([{ id: "1", desc: "", qty: 1, rate: 50000 }]);

  const totals = useMemo(() => {
    const sub = items.reduce((s, it) => s + it.qty * it.rate, 0);
    const tax = sub * gst / 100;
    return { sub, tax, grand: sub + tax };
  }, [items, gst]);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    /*
      A QUOTE WITH NO BUYER MUST NOT REACH RECEIVABLES.

      `Invoice it` converts a saved quote into a real invoice, which counts
      towards DSO, the ageing buckets and the collections chase-first list.
      Before this guard a blank (or placeholder) buyer sailed through:
      saveQuote never checked `party`, so the workspace acquired a debtor
      called "Client Name" and the dashboard went on to name it in the
      "worst overdue invoice" warning as though it were a real customer.

      Checked here AND in saveQuote — the server is the boundary that
      matters, this is the one that explains itself.
    */
    if (!to.name.trim()) {
      setSaveMsg({ ok: false, text: "Name the client before saving — a quote with no buyer becomes a receivable with no one to chase." });
      return;
    }
    if (!items.some((i) => i.desc.trim())) {
      setSaveMsg({ ok: false, text: "Describe at least one line so the quote says what it is for." });
      return;
    }
    setSaving(true); setSaveMsg(null);
    try {
      // Validity is entered as a number of days; the table stores the date it
      // actually lapses, so an expiry can be queried without re-deriving it.
      const validUntil = new Date(new Date(meta.date || Date.now()).getTime() + (Number(meta.validity) || 0) * 86_400_000)
        .toISOString().slice(0, 10);
      const res = await saveQuote({
        quote_no: meta.no, party: to.name, amount: totals.grand, valid_until: validUntil,
        meta: { from, to, items, gst, notes, subtotal: totals.sub, tax: totals.tax },
      });
      router.refresh();   // reflect the write; see test-mutation-reflects.mjs
      setSaveMsg(res.ok
        ? { ok: true, text: `Saved. ${meta.no} is kept in this workspace — it is not counted as money owed until you invoice it.` }
        : { ok: false, text: res.error || "Could not save." });
    } catch {
      setSaveMsg({ ok: false, text: "Could not reach the server. Your quote is still on screen." });
    } finally { setSaving(false); }
  }

  function upd(id: string, f: keyof Item, v: string) { setItems((xs) => xs.map((i) => i.id === id ? { ...i, [f]: f === "desc" ? v : Number(v) } : i)); }
  function add() { setItems((xs) => [...xs, { id: Date.now() + "", desc: "", qty: 1, rate: 0 }]); }
  function del(id: string) { setItems((xs) => xs.filter((i) => i.id !== id)); }

  /*
    Escaped for the same reason as invoice-generator.tsx: this writes a whole
    document onto our own origin via document.write, and from.name is seeded
    from the workspace name, which any admin can set. See the note there.
  */
  function print() {
    const rows = items.map((it) => `<tr><td>${h(it.desc)}</td><td style="text-align:right">${it.qty}</td><td style="text-align:right">${rupee(it.rate)}</td><td style="text-align:right">${rupee(it.qty * it.rate)}</td></tr>`).join("");
    const html = `<html><head><title>${h(meta.no)}</title><style>
      body{font-family:system-ui,Arial,sans-serif;color:#111;padding:32px;max-width:760px;margin:auto}
      h1{font-size:22px;margin:0 0 4px;color:#1f4a3b}.muted{color:#666;font-size:13px}
      .row{display:flex;justify-content:space-between;gap:24px;margin:18px 0}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
      th,td{border:1px solid #ddd;padding:8px}th{background:#f0f5f2;text-align:left}tfoot td{font-weight:bold}
    </style></head><body>
      <div class="row"><div><h1>QUOTATION</h1><div class="muted">${h(meta.no)} · ${h(meta.date)} · valid ${h(String(meta.validity))} days</div></div></div>
      <div class="row"><div><b>${h(from.name)}</b><div class="muted">${h(from.detail)}</div></div><div style="text-align:right"><b>For</b><div>${h(to.name)}</div><div class="muted">${h(to.detail)}</div></div></div>
      <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" style="text-align:right">Subtotal</td><td style="text-align:right">${rupee(totals.sub)}</td></tr>
      <tr><td colspan="3" style="text-align:right">GST ${gst}%</td><td style="text-align:right">${rupee(totals.tax)}</td></tr>
      <tr><td colspan="3" style="text-align:right">Total</td><td style="text-align:right">${rupee(totals.grand)}</td></tr></tfoot></table>
      <p class="muted" style="margin-top:20px"><b>Terms:</b> ${h(notes)}</p>
      <p class="muted">This is a quotation, not a tax invoice.</p>
      <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
  }

  const I = "rounded-md border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <Card className="p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2"><div className="text-sm font-medium">From</div><input className={I + " w-full"} placeholder="Your business name" aria-label="Your business name" value={from.name} onChange={(e) => setFrom({ ...from, name: e.target.value })} /><input className={I + " w-full"} placeholder="GSTIN · city · contact email" aria-label="Your GSTIN, city and contact" value={from.detail} onChange={(e) => setFrom({ ...from, detail: e.target.value })} /></div>
        <div className="space-y-2"><div className="text-sm font-medium">To</div><input className={I + " w-full"} placeholder="Client name" aria-label="Client name" required value={to.name} onChange={(e) => setTo({ ...to, name: e.target.value })} /><input className={I + " w-full"} placeholder="Client details" aria-label="Client details" value={to.detail} onChange={(e) => setTo({ ...to, detail: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <input className={I} value={meta.no} onChange={(e) => setMeta({ ...meta, no: e.target.value })} placeholder="Quote #" aria-label="Quote #" />
        <input className={I} type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
        <label className="text-sm text-muted-foreground flex items-center gap-1">Valid <input className={I + " w-16"} type="number" value={meta.validity} onChange={(e) => setMeta({ ...meta, validity: Number(e.target.value) })} /> days</label>
        <label className="text-sm text-muted-foreground flex items-center gap-1">GST <input aria-label="GST percent" aria-invalid={gstRateWarning(gst) ? true : undefined} className={I + " w-16" + (gstRateWarning(gst) ? " border-warning" : "")} type="number" value={gst} onChange={(e) => setGst(Number(e.target.value))} /> %</label>
      </div>
      {/* A quote becomes an invoice. Catching an abolished slab here is cheaper
          than catching it after the customer has accepted the price. */}
      {gstRateWarning(gst) && <p className="text-xs text-warning">{gstRateWarning(gst)}</p>}
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <input className={I + " flex-1"} placeholder="Service or product" aria-label="Line item description" value={it.desc} onChange={(e) => upd(it.id, "desc", e.target.value)} />
            <input className={I + " w-16"} type="number" value={it.qty} onChange={(e) => upd(it.id, "qty", e.target.value)} title="Qty" />
            <input className={I + " w-28"} type="number" value={it.rate} onChange={(e) => upd(it.id, "rate", e.target.value)} title="Rate" />
            <button onClick={() => del(it.id)} className="text-muted-foreground hover:text-danger min-h-11 min-w-11 p-2" aria-label="Remove"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add line</Button>
      </div>
      <textarea className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Terms & notes" aria-label="Terms & notes" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="text-sm"><div className="text-muted-foreground">Subtotal {rupee(totals.sub)} · GST {rupee(totals.tax)}</div><div className="text-lg font-bold">Total: {rupee(totals.grand)}</div></div>
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
          <div className="text-sm font-medium mb-2">Saved quotes</div>
          {/*
            EVERY QUOTE USED TO BE "OPEN" FOREVER.

            `quotes.status` is a CHECK-constrained column that listQuotes
            selected and nothing ever wrote, so it only ever held its default.
            A quote list that cannot close is a list nobody maintains.

            Converting is deliberately a separate button from "accepted",
            because a quote is not money owed — saveQuote's own note explains
            why one must never be counted as a receivable automatically.
            Winning the work is the moment that changes, and it is the owner
            who knows when that happened.
          */}
          <div className="divide-y">
            {saved.slice(0, 8).map((q: any) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{q.quote_no || "—"}</span>
                  <span className="text-muted-foreground"> · {q.party || "—"}</span>
                  <QuoteStatus status={q.status} converted={Boolean(q.meta?.converted_invoice_id)} />
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <span className="tabular-nums">{rupee(Number(q.amount) || 0)}</span>
                  <span className="text-xs text-muted-foreground">{q.valid_until ? `valid to ${q.valid_until}` : ""}</span>
                  <QuoteActions quote={q} />
                </div>
              </div>
            ))}
          </div>
          {quoteMsg && (
            <p className={`mt-3 text-sm ${quoteMsg.ok ? "text-success" : "text-danger"}`} role="status">{quoteMsg.text}</p>
          )}
        </div>
      )}
    </Card>
  );
}
