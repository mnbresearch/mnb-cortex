import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ReceivablesAging } from "@/components/receivables-aging";
import { getUserAndOrg } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { daysPastDueIST, istTodayISO } from "@/lib/statutory";
import { isOpenReceivable, isPastDueReceivable } from "@/lib/money-rules";
import { pageAll } from "@/lib/page-all";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/**
 * Every OPEN receivable, by the DASHBOARD'S definition.
 *
 * getInvoices() goes through fetchRows(), which selects * with `.limit(200)`
 * ordered by created_at — fine for a list, wrong for a total. This pages past
 * PostgREST's 1,000-row cap (up to 20,000) and reports `capped` when even that
 * was not enough.
 *
 * "Open" and "past due" are lib/money-rules.ts — the same rule as the
 * dashboard's SQL aggregate: an invoice with NO type is a receivable, and one
 * the owner marked "overdue" is past due even without a due date. This page
 * used to require type = 'receivable' and age by due date only, so the
 * dashboard and this screen printed different past-due totals for one ledger.
 *
 * `error` is returned, not swallowed: a failed read used to render "These are
 * example invoices, not yours" over a workspace that has hundreds.
 */
async function allOpenReceivables(): Promise<{ rows: any[]; live: boolean; capped: boolean; error: string | null }> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [], live: false, capped: false, error: null };
  try {
    const sb = await createClient();
    const r = await pageAll<any>((a, b) => sb.from("invoices")
      .select("id, party, amount, due_date, status, type")
      .eq("org_id", orgId)
      .or("status.is.null,status.not.ilike.paid")
      .order("amount", { ascending: false }).order("id")
      .range(a, b));
    if (r.error) return { rows: [], live: true, capped: false, error: r.error };
    return { rows: r.rows.filter(isOpenReceivable), live: true, capped: r.truncated, error: null };
  } catch (e: any) {
    return { rows: [], live: true, capped: false, error: e?.message || "unknown error" };
  }
}

/**
 * Won orders in the last 90 days — ALL of them, for the DSO denominator.
 *
 * This used getSalesOrders(), the list read capped at the newest 200 orders,
 * so a busy workspace's "monthly credit sales" was whatever fraction of 90
 * days fitted in 200 rows, and DSO came out too high. Filtered in Postgres and
 * paged, so the 20,000 budget is spent on rows that count.
 */
async function wonLast90Days(): Promise<{ rows: any[]; error: string | null }> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [], error: null };
  try {
    const sb = await createClient();
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const r = await pageAll<any>((a, b) => sb.from("sales_orders")
      .select("id, amount, status, order_date, created_at")
      .eq("org_id", orgId)
      .ilike("status", "won")
      .or(`order_date.gte.${since},and(order_date.is.null,created_at.gte.${since})`)
      .order("id")
      .range(a, b));
    return { rows: r.rows, error: r.error };
  } catch (e: any) {
    return { rows: [], error: e?.message || "unknown error" };
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
 *
 * The ARITHMETIC was wrong too, in a way that made this page disagree with the
 * dashboard every evening. `Math.round((Date.now() - due) / 86_400_000)` with
 * `due` parsed as UTC midnight crosses the half-day mark at 12:00 UTC — 17:30
 * IST — so from half past five an invoice due TODAY counted as one day past
 * due and was added to `totals.overdue` and the 0–30 bucket. metrics.ts gets
 * the dashboard's figure right with an IST date comparison, so the two screens
 * printed different overdue totals for the same ledger. One definition now,
 * in lib/statutory.ts, anchored on IST midnight and exact to the day.
 */
const daysPastDue = (due: any): number => daysPastDueIST(due);

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
  /*
    Fetched TOGETHER with the sales orders below.

    These two reads are independent — receivables come from `invoices`, the
    monthly-revenue hint from `sales_orders` — and they were awaited one after
    the other about fifty lines apart, so the page paid for both round trips in
    series on every render. Nothing between them uses the first result.
  */
  const [{ rows, live, capped, error }, { rows: soRows, error: soError }] =
    await Promise.all([allOpenReceivables(), wonLast90Days()]);
  const today = istTodayISO();
  const open = (live ? rows : [])
    .map((i) => ({
      id: String(i.id),
      client: String(i.party || "Unnamed"),
      amount: n(i.amount),
      days: daysPastDue(i.due_date),
      pastDue: isPastDueReceivable(i, today),
    }));
  /* Marked "overdue" by the owner, but with no due date in the past to age
     from. The dashboard counts these as past due; so does this page. Their
     age is unknown, so they are placed in the first late bucket and the page
     says how many there are rather than pretending to know how late. */
  const markedOnly = open.filter((i) => i.pastDue && i.days <= 0);

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
    overdue: open.filter((i) => i.pastDue).reduce((s, i) => s + i.amount, 0),
    notYetDue: open.filter((i) => !i.pastDue).reduce((s, i) => s + i.amount, 0),
    buckets: {
      d30: open.filter((i) => i.pastDue && i.days <= 30).reduce((s, i) => s + i.amount, 0),
      d60: open.filter((i) => i.days > 30 && i.days <= 60).reduce((s, i) => s + i.amount, 0),
      d90: open.filter((i) => i.days > 60 && i.days <= 90).reduce((s, i) => s + i.amount, 0),
      d90p: open.filter((i) => i.days > 90).reduce((s, i) => s + i.amount, 0),
    },
  };

  /* The table stays capped — 300 editable rows is not a usable screen — but it
     is now explicitly "the largest 60 of N", and the totals above are whole. */
  /* `days` stays the real days-past-due (≤ 0 for a row marked overdue with no
     past due date) — inventing "1 day late" for those would be a claim the
     ledger does not support. They are in the totals; the note above says so. */
  const seed = [...open].sort((a, b) => b.amount - a.amount).slice(0, 60)
    .map(({ pastDue: _p, ...i }) => i);

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
  const NINETY = 90 * 86_400_000;
  const recentWon = (soError ? [] : soRows).filter((o) => {
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
        {error ? (
          /* A failed read is not an empty book. Without this the component
             fell back to its sample rows and said "These are example
             invoices, not yours" to an owner with hundreds of real ones. */
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
            <b className="text-danger">Cortex couldn&rsquo;t read your invoices just now.</b>{" "}
            Nothing below is shown because none of it would be yours. Reload to try again; if it keeps
            failing, the database said: <span className="text-muted-foreground">{error}</span>
          </div>
        ) : (
          <>
            {capped && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm mb-3">
                You have more than 20,000 open invoices; the figures below cover the largest 20,000 Cortex could read.
              </div>
            )}
            {markedOnly.length > 0 && (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground mb-3">
                {markedOnly.length} invoice{markedOnly.length === 1 ? " is" : "s are"} marked <b>overdue</b> without a past due date.
                They count as past due here, as on the dashboard, and sit in the first late bucket because how late
                they are is not recorded.
              </div>
            )}
            {soError && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm mb-3">
                Cortex couldn&rsquo;t read your recent sales, so DSO is not calculated — enter your monthly credit sales below.
              </div>
            )}
            <ReceivablesAging seed={seed} totals={totals} creditSalesHint={creditSalesHint} />
          </>
        )}
      </PageShell>
    </>
  );
}
