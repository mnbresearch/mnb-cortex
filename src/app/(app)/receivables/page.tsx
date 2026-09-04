import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ReceivablesAging } from "@/components/receivables-aging";
import { getInvoices, getSalesOrders } from "@/lib/data";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/**
 * Whole days between a due date and today. NEGATIVE means not yet due.
 *
 * The sign used to be thrown away with `Math.max(0, …)`, which quietly merged
 * two completely different things: an invoice issued yesterday on 30-day terms
 * and an invoice that went overdue this morning both became "0". They then sat
 * together in a bucket labelled "Current (0–30)" under a column headed "Days
 * outstanding" — so money that was not owed yet was displayed as money that was
 * up to a month late. The sign is now kept and the labels say which is which.
 */
function daysPastDue(due: any): number {
  if (!due) return 0;
  const t = new Date(due).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.round((Date.now() - t) / 86_400_000);
}

export default async function Receivables() {
  /*
    This page rendered four invented invoices — under the heading "Who owes you,
    how old it is, and who to chase first" — while the customer's real invoices
    sat in the database untouched. Every number on it (total, DSO, priority
    list) described a fiction.
  */
  const { rows, live } = await getInvoices();
  const open = (live ? rows : [])
    .filter((i) => String(i.type || "receivable").toLowerCase() !== "payable")
    .filter((i) => String(i.status || "").toLowerCase() !== "paid")
    .map((i) => ({
      id: String(i.id),
      client: String(i.party || "Unnamed"),
      amount: n(i.amount),
      days: daysPastDue(i.due_date),
    }));

  /*
    The totals are computed over EVERY open invoice, then the table is
    truncated — not the other way round.

    It used to slice to the largest 60 and let the component total what it was
    given, so a workspace with 300 open invoices was shown a "Total receivable"
    that silently omitted 240 of them. Always too low, never flagged, and it is
    the headline number on a page about who owes you money.
  */
  const totals = {
    total: open.reduce((s, i) => s + i.amount, 0),
    count: open.length,
    overdue: open.filter((i) => i.days > 0).reduce((s, i) => s + i.amount, 0),
    notYetDue: open.filter((i) => i.days <= 0).reduce((s, i) => s + i.amount, 0),
    buckets: {
      d30: open.filter((i) => i.days > 0 && i.days <= 30).reduce((s, i) => s + i.amount, 0),
      d60: open.filter((i) => i.days > 30 && i.days <= 60).reduce((s, i) => s + i.amount, 0),
      d90: open.filter((i) => i.days > 60 && i.days <= 90).reduce((s, i) => s + i.amount, 0),
      d90p: open.filter((i) => i.days > 90).reduce((s, i) => s + i.amount, 0),
    },
  };

  /* The table stays capped — 300 editable rows is not a usable screen — but it
     is now explicitly "the largest 60 of N", and the totals above are whole. */
  const seed = [...open].sort((a, b) => b.amount - a.amount).slice(0, 60);

  /*
    DSO = receivables / monthly credit sales × 30.

    Two things were wrong. Using the "Revenue (MTD)" KPI blew the ratio up into
    the hundreds of days on the 2nd of the month and then fell all month. And
    when there was too little history the component fell back to a HARDCODED
    ₹60,00,000 of monthly sales — so a brand-new workspace was shown a specific,
    confident DSO derived from a turnover figure we invented for them.

    Averaging the last 90 days of won orders gives a stable monthly figure.
    Where there is not enough history, the hint stays undefined and the
    component prints "—" and asks for the number, rather than guessing.
  */
  const { rows: soRows, live: soLive } = await getSalesOrders();
  const NINETY = 90 * 86_400_000;
  const recentWon = (soLive ? soRows : []).filter((o) => {
    if (String(o.status || "").toLowerCase() !== "won") return false;
    const t = new Date(o.order_date || o.created_at || 0).getTime();
    return Number.isFinite(t) && Date.now() - t <= NINETY;
  });
  const monthlyCreditSales = recentWon.reduce((s, o) => s + n(o.amount), 0) / 3;
  const creditSalesHint = recentWon.length >= 3 && monthlyCreditSales > 0
    ? monthlyCreditSales
    : undefined;

  return (
    <>
      <Topbar title="Receivables & DSO" subtitle="Who owes you, how old it is, and who to chase first" />
      <PageShell>
        <ReceivablesAging seed={seed} totals={totals} creditSalesHint={creditSalesHint} />
      </PageShell>
    </>
  );
}
