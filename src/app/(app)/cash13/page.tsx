import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Cash13, type Cash13Seed } from "@/components/cash13";
import { getMetrics, getTableStats } from "@/lib/data";
import { istTodayISO } from "@/lib/statutory";
import { isOpenReceivable, scheduleByDueDate } from "@/lib/money-rules";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/**
 * Seed the 13-week model from the workspace's real position.
 *
 * The component used to open with ₹18,90,000 and thirteen identical weeks of
 * ₹9,50,000 in / ₹8,80,000 out — constants, read from nothing. A page sold as
 * "see the crunch coming while you can still act" therefore showed every
 * customer the same invented business, and the low point it highlighted was a
 * property of the hardcoded array rather than of their cash.
 *
 * Three real sources, in the order they can be trusted:
 *
 *   opening   the cash_balance KPI, which comes from a bank statement the
 *             customer uploaded. Nothing else in the product knows their actual
 *             balance, so if that is absent we say so rather than substitute.
 *
 *   inflow    unpaid receivables spread over the quarter. Thirteen weeks is one
 *             quarter, and an invoice book is the best available estimate of
 *             money due in that window.
 *
 *   outflow   unpaid payables, the same way.
 *
 * Every one of these is an ESTIMATE and the page says so. That is fine — the
 * tool is for modelling — but the starting point has to be the customer's own
 * numbers, because a default that looks like data gets treated as data.
 */
/** Inflows more than this many days overdue are left out as doubtful (stated on the page). */
const DOUBTFUL_AFTER_DAYS = 90;
/** Purchase orders carry no due date; committed ones are assumed payable 30 days after they were raised (stated). */
const PO_TERMS_DAYS = 30;

const inr0 = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");

async function buildSeed(): Promise<Cash13Seed> {
  const empty: Cash13Seed = { opening: null, weeklyIn: null, weeklyOut: null, basis: null };
  try {
    /*
      EVERY open invoice and committed PO, scheduled BY DUE DATE.

      This used getInvoices() — a 200-row list read — and spread the whole
      unpaid book evenly over 13 weeks. So an invoice 200 days overdue arrived
      in thirteen equal slices, an invoice due in week 12 partly arrived in
      week 1, committed purchase orders were never paid at all, and a busy
      workspace's book was whatever fitted in 200 rows. The rule is now
      lib/money-rules.ts scheduleByDueDate, and every exclusion is stated.
    */
    const [metrics, inv, po] = await Promise.all([
      getMetrics(),
      getTableStats("invoices", "id, amount, status, type, due_date, created_at"),
      getTableStats("purchase_orders", "id, amount, status, created_at"),
    ]);
    if (inv.error || po.error) {
      return { ...empty, error: `Cortex couldn't read your invoices and purchase orders just now (${inv.error || po.error}). Reload to try again.` };
    }

    const cash = metrics.find((m) => m.metric_key === "cash_balance");
    const opening = cash ? Math.round(n(cash.value)) : null;

    const today = istTodayISO();
    const rows = inv.live ? inv.rows : [];
    const open = rows.filter((i) => String(i.status || "").toLowerCase() !== "paid");
    const recvRows = open.filter((i) => isOpenReceivable(i));
    const payRows = open.filter((i) => String(i.type || "").toLowerCase() === "payable");
    const committedPOs = (po.live ? po.rows : [])
      .filter((p) => ["sent", "received", "approved"].includes(String(p.status || "").toLowerCase()));

    const addDays = (d: any, days: number) => {
      const t = new Date(String(d || "")).getTime();
      return Number.isFinite(t) ? new Date(t + days * 86_400_000).toISOString().slice(0, 10) : null;
    };

    /* Inflows: an unknown never flatters cash — undated and >90-days-overdue
       receivables are left OUT, with their totals shown. */
    const inS = scheduleByDueDate(recvRows.map((i) => ({ amount: n(i.amount), due: i.due_date || null })), today,
      { doubtfulAfterDays: DOUBTFUL_AFTER_DAYS, undated: "exclude" });
    /* Outflows: anything already owed lands in week 1, however late — you
       still owe it. Undated bills also take week 1 (the conservative side). */
    const outS = scheduleByDueDate([
      ...payRows.map((i) => ({ amount: n(i.amount), due: i.due_date || null })),
      ...committedPOs.map((p) => ({ amount: n(p.amount), due: addDays(p.created_at, PO_TERMS_DAYS) })),
    ], today, { doubtfulAfterDays: Number.POSITIVE_INFINITY, undated: "week1" });

    const anyIn = inS.weeks.some((v) => v !== 0), anyOut = outS.weeks.some((v) => v !== 0);
    /* Nothing to go on at all — say so, rather than open on a made-up number. */
    if (opening === null && !anyIn && !anyOut && recvRows.length === 0 && payRows.length === 0 && committedPOs.length === 0) return empty;

    /*
      DATE THE OPENING BALANCE.

      This is a 13-week FORWARD cash projection, and it opens on the closing
      balance of the last bank statement the owner uploaded — which may be
      months old. The metric label carries the period; using it here is what
      turns a misleading projection into a dated one.
    */
    const asAt = (cash?.label.match(/\(as at ([^)]+)\)/) || [])[1] || "";

    const parts: string[] = [];
    if (opening !== null) parts.push(asAt ? `your bank statement for ${asAt}` : "your last bank statement");
    if (recvRows.length || payRows.length || committedPOs.length) {
      parts.push("your open invoices and committed purchase orders, each placed in the week it falls due");
    }

    const notes: string[] = [];
    if (inS.overdueInWeek1) notes.push(`${inr0(inS.overdueInWeek1)} of receivables is already overdue (up to ${DOUBTFUL_AFTER_DAYS} days) and is placed in week 1 — the earliest it could arrive, not a promise that it will.`);
    if (inS.excludedDoubtful) notes.push(`${inr0(inS.excludedDoubtful)} of receivables more than ${DOUBTFUL_AFTER_DAYS} days overdue is left out as doubtful.`);
    if (inS.undatedExcluded) notes.push(`${inr0(inS.undatedExcluded)} of receivables has no due date and is left out — add due dates to schedule it.`);
    if (inS.beyondWindow) notes.push(`${inr0(inS.beyondWindow)} of receivables falls due after week 13.`);
    if (outS.overdueInWeek1 || outS.undatedInWeek1) notes.push(`${inr0(outS.overdueInWeek1 + outS.undatedInWeek1)} of bills already past due or undated is placed in week 1.`);
    if (committedPOs.length) notes.push(`Committed purchase orders have no due date in Cortex, so each is assumed payable ${PO_TERMS_DAYS} days after it was raised.`);
    if (inv.truncated || po.truncated) notes.push("More than 20,000 rows: only the first 20,000 Cortex could read are included.");
    if (opening === null) notes.push("Cortex has no bank balance for you, so the opening balance is blank — enter it to see the low point. Until then the page shows net movement only and makes no out-of-cash claim.");

    return {
      opening,
      weeklyIn: null,
      weeklyOut: null,
      weeklyInByWeek: inS.weeks,
      weeklyOutByWeek: outS.weeks,
      notes,
      basis: parts.join(" and "),
    };
  } catch (e: any) {
    return { ...empty, error: `Cortex couldn't build your cash position just now (${e?.message || "unknown error"}).` };
  }
}

export default async function Cash13Page() {
  const seed = await buildSeed();
  return (
    <>
      <Topbar title="13-Week Cash Flow" subtitle="See the crunch coming while you can still act" />
      <PageShell>
        <Cash13 seed={seed} />
        <Section title="How to use this weekly" desc="The discipline that saves businesses">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Thirteen weeks is one quarter — far enough to see trouble, close enough to forecast honestly. Update it every Monday: roll the window forward, put in what you actually expect to receive and pay.</p>
            <p>Watch the <b>lowest point</b>, not the closing balance. A business that ends the quarter healthy can still fail in week 6 if it runs out mid-way.</p>
            <p>Cortex seeds this from your bank balance and your open invoices and purchase orders, each in the week it falls due. Customers rarely pay on the due date — replacing those estimates with what you actually expect is the whole exercise.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
