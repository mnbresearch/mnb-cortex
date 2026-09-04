"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Inv = { id: string; client: string; amount: number; days: number };

export type Totals = {
  total: number;
  count: number;
  overdue: number;
  notYetDue: number;
  buckets: { d30: number; d60: number; d90: number; d90p: number };
};

// Placeholder rows shown only until the workspace has real invoices. These
// were named "Reliance Retail" and "Tata Croma" — real, trademarked companies
// presented as this customer's debtors, which is both misleading and a
// needless legal exposure.
const SEED: Inv[] = [
  { id: "i1", client: "Example retailer", amount: 850000, days: -6 },
  { id: "i2", client: "Example electronics chain", amount: 420000, days: 38 },
  { id: "i3", client: "Example distributor", amount: 260000, days: 74 },
  { id: "i4", client: "Example kirana chain", amount: 180000, days: 105 },
];

/**
 * `days` is days PAST DUE, and it may be negative.
 *
 * The old buckets were labelled "Current (0–30)", "31–60", "61–90", "90+" and
 * the table column read "Days outstanding" — but the value was days past due,
 * clamped so that anything not yet due became 0. So an invoice issued this
 * morning on 30-day terms was displayed in the same bucket as one that went
 * overdue a month ago, and the column heading described a quantity nobody was
 * computing. Money you are owed but cannot yet chase is a different thing from
 * money that is late, and the first bucket now says so.
 */
const BUCKETS = [
  { key: "notYetDue" as const, label: "Not yet due", test: (d: number) => d <= 0, tone: "text-muted-foreground" },
  { key: "d30" as const, label: "1–30 days late", test: (d: number) => d > 0 && d <= 30, tone: "text-foreground" },
  { key: "d60" as const, label: "31–60 days late", test: (d: number) => d > 30 && d <= 60, tone: "text-warning" },
  { key: "d90" as const, label: "61–90 days late", test: (d: number) => d > 60 && d <= 90, tone: "text-warning" },
  { key: "d90p" as const, label: "Over 90 days late", test: (d: number) => d > 90, tone: "text-danger" },
];

/**
 * `seed` is the workspace's REAL unpaid receivables, passed from the server.
 *
 * This component previously always started from SEED — four invented invoices
 * — under the page heading "Who owes you, how old it is, and who to chase
 * first". A customer with a hundred real invoices in Cortex saw none of them
 * here, and the totals, DSO and "chase first" list all described a fiction.
 * The sample now appears only when there is genuinely nothing to show, and
 * says so.
 *
 * `totals` is computed by the server over EVERY open invoice. The table below
 * shows at most 60 rows because 300 editable rows is not a usable screen — but
 * the headline total must not be the total of the visible rows, which is what
 * it used to be. Once the owner edits a row the figures switch to the edited
 * set and the screen says which it is showing.
 */
export function ReceivablesAging({
  seed, totals, creditSalesHint,
}: { seed?: Inv[]; totals?: Totals; creditSalesHint?: number } = {}) {
  const isReal = Boolean(seed && seed.length);
  const [invs, setInvs] = useState<Inv[]>(isReal ? seed! : SEED);
  const [edited, setEdited] = useState(false);

  /*
    No fallback turnover.

    This used to default to 6_000_000 — sixty lakh a month, invented — whenever
    the workspace had too little sales history. The page then printed a
    specific DSO in bold, and an owner had no way to know the denominator was
    fiction. It now starts empty and DSO reads "—" with a prompt, because a
    missing number the owner can supply is better than a wrong one they cannot
    see.
  */
  const [creditSales, setCreditSales] = useState<number | null>(
    creditSalesHint && creditSalesHint > 0 ? Math.round(creditSalesHint) : null,
  );

  const m = useMemo(() => {
    const rowTotal = invs.reduce((s, i) => s + i.amount, 0);
    const truncated = Boolean(totals && !edited && totals.count > invs.length);

    /* Server totals while the rows are untouched; the visible rows once the
       owner starts editing, because then they are modelling, not reporting. */
    const useServer = Boolean(totals && !edited);
    const total = useServer ? totals!.total : rowTotal;
    const overdue = useServer
      ? totals!.overdue
      : invs.filter((i) => i.days > 0).reduce((s, i) => s + i.amount, 0);

    const buckets = BUCKETS.map((b) => ({
      ...b,
      amount: useServer
        ? (b.key === "notYetDue" ? totals!.notYetDue : totals!.buckets[b.key])
        : invs.filter((i) => b.test(i.days)).reduce((s, i) => s + i.amount, 0),
    }));

    // DSO ≈ receivables / monthly credit sales × 30. Undefined without a base.
    const dso = creditSales && creditSales > 0 ? (total / creditSales) * 30 : null;

    /* Only genuinely late invoices are worth chasing, and only the visible
       rows can be ranked — which is why the caption says "of the rows below". */
    const priority = invs.filter((i) => i.days > 0)
      .sort((a, b) => b.amount * b.days - a.amount * a.days).slice(0, 4);

    return { total, overdue, buckets, dso, priority, truncated, shown: invs.length, count: totals?.count ?? invs.length };
  }, [invs, creditSales, totals, edited]);

  function upd(id: string, k: keyof Inv, v: string) {
    setEdited(true);
    setInvs((xs) => xs.map((i) => i.id === id ? { ...i, [k]: k === "client" ? v : Number(v) } : i));
  }
  function add() { setEdited(true); setInvs((xs) => [...xs, { id: "i" + Date.now(), client: "New client", amount: 100000, days: 15 }]); }
  function del(id: string) { setEdited(true); setInvs((xs) => xs.filter((i) => i.id !== id)); }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      {!isReal && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          These are <b>example invoices</b>, not yours — add invoices in Finance or import them and this
          page will age your real book, work out your DSO, and tell you who to chase first.
        </div>
      )}
      {m.truncated && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          The totals cover all <b>{m.count}</b> open invoices. The table below shows the largest{" "}
          <b>{m.shown}</b> so it stays workable — edit any row and the figures switch to what you can see.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={m.truncated ? `Total receivable (all ${m.count})` : "Total receivable"} value={inr(m.total)} />
        <Stat label="Past due" value={inr(m.overdue)} cls={m.overdue > 0 ? "text-danger" : "text-success"} />
        <Stat label="DSO" value={m.dso === null ? "—" : `${m.dso.toFixed(0)} days`} highlight
          hint={m.dso === null ? "Enter your monthly credit sales below" : undefined} />
        <Stat label="Past-due share" value={m.total ? `${((m.overdue / m.total) * 100).toFixed(0)}%` : "0%"} />
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-semibold">Open invoices</div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1">Monthly credit sales ₹
              <input className={I + " w-28"} type="number" value={creditSales ?? ""}
                placeholder="e.g. 850000"
                onChange={(e) => setCreditSales(e.target.value === "" ? null : Number(e.target.value))} /></label>
            <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </div>
        {creditSales === null && (
          <p className="text-xs text-muted-foreground">
            DSO needs your average monthly credit sales. Cortex works this out from your won orders once
            there are at least three in the last 90 days — until then, type it in and the figure appears.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-2 font-medium">Client</th><th className="py-2 pr-2 font-medium">Amount ₹</th><th className="py-2 pr-2 font-medium">Days past due</th><th className="py-2 font-medium">Bucket</th></tr></thead>
            <tbody>
              {invs.map((i) => {
                const b = BUCKETS.find((x) => x.test(i.days))!;
                return (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2"><input className={I + " w-40"} value={i.client} onChange={(e) => upd(i.id, "client", e.target.value)} /></td>
                    <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={i.amount} onChange={(e) => upd(i.id, "amount", e.target.value)} /></td>
                    <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={i.days} onChange={(e) => upd(i.id, "days", e.target.value)} /></td>
                    <td className="py-1.5"><div className="flex items-center gap-2"><span className={`text-xs font-medium ${b.tone}`}>{b.label}</span><button onClick={() => del(i.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          A negative number means the invoice is not due yet.
        </p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="font-semibold mb-2">Ageing buckets</div>
          <div className="text-xs text-muted-foreground mb-2">Measured from the due date, not the invoice date.</div>
          {m.buckets.map((b) => (
            <div key={b.label} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <span className={b.tone}>{b.label}</span><span className="font-medium tabular-nums">{inr(b.amount)}</span>
            </div>
          ))}
        </Card>
        <Card className="p-5">
          <div className="font-semibold mb-2">Chase these first</div>
          <div className="text-xs text-muted-foreground mb-2">
            Past-due invoices from the rows below, ranked by amount × days — biggest, oldest money.
          </div>
          {m.priority.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">Nothing is past due. Good.</div>
          ) : m.priority.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <span>{i + 1}. {p.client} <span className="text-muted-foreground">· {p.days}d late</span></span><span className="font-medium tabular-nums">{inr(p.amount)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight, hint }: { label: string; value: string; cls?: string; highlight?: boolean; hint?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
