import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Cash13, type Cash13Seed } from "@/components/cash13";
import { getMetrics, getInvoices } from "@/lib/data";

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
async function buildSeed(): Promise<Cash13Seed> {
  const empty: Cash13Seed = { opening: null, weeklyIn: null, weeklyOut: null, basis: null };
  try {
    const [metrics, inv] = await Promise.all([getMetrics(), getInvoices()]);

    const cash = metrics.find((m) => m.metric_key === "cash_balance");
    const opening = cash ? Math.round(n(cash.value)) : null;

    const rows = inv.live ? inv.rows : [];
    const open = rows.filter((i) => String(i.status || "").toLowerCase() !== "paid");
    const recv = open.filter((i) => String(i.type || "receivable").toLowerCase() !== "payable")
      .reduce((s, i) => s + n(i.amount), 0);
    const pay = open.filter((i) => String(i.type || "").toLowerCase() === "payable")
      .reduce((s, i) => s + n(i.amount), 0);

    /* Nothing to go on at all — say so, rather than open on a made-up number. */
    if (opening === null && recv === 0 && pay === 0) return empty;

    const parts: string[] = [];
    if (opening !== null) parts.push("your last bank statement");
    if (recv > 0 || pay > 0) parts.push("your unpaid invoices spread over 13 weeks");

    return {
      opening,
      weeklyIn: recv > 0 ? Math.round(recv / 13) : null,
      weeklyOut: pay > 0 ? Math.round(pay / 13) : null,
      basis: parts.join(" and "),
    };
  } catch {
    return empty;
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
            <p>Cortex seeds this from your bank balance and your unpaid invoices, spread evenly. Real weeks are never even — replacing those estimates with what you actually expect is the whole exercise.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
