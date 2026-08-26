import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ReceivablesAging } from "@/components/receivables-aging";
import { getInvoices, getSalesOrders } from "@/lib/data";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Whole days between a due date and today. Negative means not yet due. */
function daysOverdue(due: any): number {
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
  const seed = (live ? rows : [])
    .filter((i) => String(i.type || "receivable").toLowerCase() !== "payable")
    .filter((i) => String(i.status || "").toLowerCase() !== "paid")
    .map((i) => ({
      id: String(i.id),
      client: String(i.party || "Unnamed"),
      amount: n(i.amount),
      days: Math.max(0, daysOverdue(i.due_date)),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 60);

  /*
    DSO = receivables / monthly credit sales x 30.

    Using the "Revenue (MTD)" KPI here was wrong: month-to-date on the 2nd is
    about a fifteenth of a month, so the ratio blew up into the hundreds of
    days and then fell all month. Averaging the last 90 days of won orders
    gives a stable monthly figure. Undefined when there is too little history,
    so the component keeps its editable default instead of printing a confident
    number derived from a week.
  */
  const { rows: soRows, live: soLive } = await getSalesOrders();
  const NINETY = 90 * 86_400_000;
  const recentWon = (soLive ? soRows : []).filter((o) => {
    if (String(o.status || "").toLowerCase() !== "won") return false;
    const t = new Date(o.order_date || o.created_at || 0).getTime();
    return Number.isFinite(t) && Date.now() - t <= NINETY;
  });
  const creditSalesHint = recentWon.length >= 3
    ? recentWon.reduce((s, o) => s + n(o.amount), 0) / 3
    : undefined;

  return (
    <>
      <Topbar title="Receivables & DSO" subtitle="Who owes you, how old it is, and who to chase first" />
      <PageShell><ReceivablesAging seed={seed} creditSalesHint={creditSalesHint} /></PageShell>
    </>
  );
}
