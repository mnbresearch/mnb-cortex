import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { PayablesDpo } from "@/components/payables-dpo";
import { getTableStats } from "@/lib/data";
import { daysPastDueIST } from "@/lib/statutory";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
/* IST, floor-exact, shared with /receivables and the reminder emails. The
   UTC `Math.round` this replaced flipped at 17:30 IST, so from half past five
   a bill due today aged as one day old and inflated DPO. */
const ageDays = (d: any) => Math.max(0, daysPastDueIST(d));

export default async function Payables() {
  /*
    Payables lived in two places and this page read neither: supplier invoices
    (type = "payable") and committed purchase orders. Both are money owed, so
    both belong in DPO — a PO that has been sent is a commitment whether or not
    the supplier's invoice has landed.
  */
  /*
    EVERY open payable, not the newest 200.

    This read getInvoices()/getPurchaseOrders() — list reads capped at 200
    rows each, newest first — then sliced to the largest 60, and the component
    totalled whatever it was handed. So "Total payable" covered at most 60 of
    at most 200 bills: always too low, never flagged, on the page an owner uses
    to decide what to pay. The totals are now computed here over every row
    (paged past PostgREST's 1,000 cap), and only the TABLE is truncated, with
    "showing N of M" on screen.
  */
  const [inv, po] = await Promise.all([
    getTableStats("invoices", "id, party, amount, status, type, due_date, created_at"),
    getTableStats("purchase_orders", "id, supplier, amount, status, created_at"),
  ]);
  const invRows = inv.rows, poRows = po.rows, invLive = inv.live, poLive = po.live;
  const readError = inv.error || po.error;

  const allBills = [
    ...(invLive ? invRows : [])
      .filter((i) => String(i.type || "").toLowerCase() === "payable")
      .filter((i) => String(i.status || "").toLowerCase() !== "paid")
      .map((i) => ({ id: `inv-${i.id}`, vendor: String(i.party || "Unnamed supplier"), amount: n(i.amount), days: ageDays(i.due_date || i.created_at) })),
    ...(poLive ? poRows : [])
      .filter((p) => ["sent", "received", "approved"].includes(String(p.status || "").toLowerCase()))
      .map((p) => ({ id: `po-${p.id}`, vendor: String(p.supplier || "Unnamed supplier"), amount: n(p.amount), days: ageDays(p.created_at) })),
  ].sort((a, b) => b.amount - a.amount);
  const totals = {
    total: allBills.reduce((s, b) => s + b.amount, 0),
    count: allBills.length,
    truncated: inv.truncated || po.truncated,
  };
  const bills = allBills.slice(0, 60);

  /*
    DPO = outstanding payables / monthly purchases x 30. The denominator must be
    a FLOW (what you buy in a month), not the stock of what is currently unpaid.
    Passing the outstanding total made numerator and denominator identical, so
    the headline "DPO" read exactly 30.0 days for every workspace — a fabricated
    number that looked derived, which is worse than the placeholder it replaced.

    Monthly purchases are approximated as everything raised in the last 90 days,
    divided by three. Left undefined when there is too little history, so the
    component keeps its own editable default rather than showing a confident
    figure built on one week of data.
    */
  const NINETY = 90 * 86_400_000;
  const recentPurchases = [
    ...(invLive ? invRows : []).filter((i) => String(i.type || "").toLowerCase() === "payable"),
    ...(poLive ? poRows : []).filter((p) => ["sent", "received", "approved"].includes(String(p.status || "").toLowerCase())),
  ].filter((r) => {
    const t = new Date(r.created_at || r.due_date || 0).getTime();
    return Number.isFinite(t) && Date.now() - t <= NINETY;
  });
  const purchasesHint = recentPurchases.length >= 3
    ? recentPurchases.reduce((s, r) => s + n(r.amount), 0) / 3
    : undefined;

  return (
    <>
      <Topbar title="Payables & DPO" subtitle="What you owe, how long you take, and when to pay early" />
      <PageShell>
        {readError ? (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm mb-3">
            <b className="text-danger">Cortex couldn&rsquo;t read all of your bills just now</b> ({readError}). The figures below may be
            incomplete — reload to try again before acting on them.
          </div>
        ) : null}
        <PayablesDpo seed={bills} purchasesHint={purchasesHint} totals={totals} />
      </PageShell>
    </>
  );
}
