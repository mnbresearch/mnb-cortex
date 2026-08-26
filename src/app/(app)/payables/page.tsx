import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { PayablesDpo } from "@/components/payables-dpo";
import { getInvoices, getPurchaseOrders } from "@/lib/data";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const ageDays = (d: any) => {
  if (!d) return 0;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 86_400_000)) : 0;
};

export default async function Payables() {
  /*
    Payables lived in two places and this page read neither: supplier invoices
    (type = "payable") and committed purchase orders. Both are money owed, so
    both belong in DPO — a PO that has been sent is a commitment whether or not
    the supplier's invoice has landed.
  */
  const [{ rows: invRows, live: invLive }, { rows: poRows, live: poLive }] =
    await Promise.all([getInvoices(), getPurchaseOrders()]);

  const bills = [
    ...(invLive ? invRows : [])
      .filter((i) => String(i.type || "").toLowerCase() === "payable")
      .filter((i) => String(i.status || "").toLowerCase() !== "paid")
      .map((i) => ({ id: `inv-${i.id}`, vendor: String(i.party || "Unnamed supplier"), amount: n(i.amount), days: ageDays(i.due_date || i.created_at) })),
    ...(poLive ? poRows : [])
      .filter((p) => ["sent", "received", "approved"].includes(String(p.status || "").toLowerCase()))
      .map((p) => ({ id: `po-${p.id}`, vendor: String(p.supplier || "Unnamed supplier"), amount: n(p.amount), days: ageDays(p.created_at) })),
  ].sort((a, b) => b.amount - a.amount).slice(0, 60);

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
      <PageShell><PayablesDpo seed={bills} purchasesHint={purchasesHint} /></PageShell>
    </>
  );
}
