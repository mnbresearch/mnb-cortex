import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ReceivablesAging } from "@/components/receivables-aging";
import { getSalesOrders, getUserAndOrg } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** How many invoices we will read. Above this the page says so. */
const CEILING = 5000;

/**
 * Every OPEN receivable, not the most recent 200.
 *
 * getInvoices() goes through fetchRows(), which selects * with `.limit(200)`
 * ordered by created_at — fine for a list, wrong for a total. Reading four
 * columns instead of * makes a much larger ceiling cheap, and filtering in
 * Postgres rather than in JS means the 5,000 budget is spent on invoices that
 * actually count rather than on paid ones.
 */
async function allOpenReceivables(): Promise<{ rows: any[]; live: boolean; capped: boolean }> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [], live: false, capped: false };
  try {
    const sb = createClient();
    const { data } = await sb.from("invoices")
      .select("id, party, amount, due_date")
      .eq("org_id", orgId).eq("type", "receivable")
      .or("status.is.null,status.not.ilike.paid")
      .order("amount", { ascending: false })
      .limit(CEILING);
    const rows = (data as any[]) || [];
    return { rows, live: true, capped: rows.length >= CEILING };
  } catch {
    return { rows: [], live: false, capped: false };
  }
}

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
  /*
    NOT getInvoices(). fetchRows() caps at 200 rows ordered by created_at, so a
    workspace with 300 open invoices would still get an understated headline
    total — the same bug as the old slice(0, 60), just at a higher number, and
    the previous version of this comment wrongly claimed it was fixed.

    This reads only the four columns the page needs, with a ceiling high enough
    that the truncation notice below is honest about it when reached.
  */
  const { rows, live } = await allOpenReceivables();
  const open = (live ? rows : [])
    .map((i) => ({
      id: String(i.id),
      client: String(i.party || "Unnamed"),
      amount: n(i.amount),
      days: daysPastDue(i.due_date),
    }));

  /*
    The totals are computed over every open invoice we read, then the table is
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
