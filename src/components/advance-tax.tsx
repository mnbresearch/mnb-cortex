"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";
import { ExampleFigures } from "@/components/example-figures";
import { orDefault, seedSource, type WorkspaceSeed } from "@/lib/seed-types";
import { computeTax } from "@/lib/tax-slabs";
import {
  computeAdvanceTax, nextInstalment, SCHEDULE, PRESUMPTIVE_SCHEDULE,
  ADVANCE_TAX_AS_OF, ADVANCE_TAX_SECTION_NOTE, ADVANCE_TAX_THRESHOLD,
} from "@/lib/advance-tax";

/**
 * THE PAGE THAT NAMED THE INTEREST AND NEVER COMPUTED IT.
 *
 * What was here: four static rows of percentages, its own private copy of the
 * instalment schedule, and a paragraph reading "Shortfalls attract interest
 * under sections 234B/234C" — with no interest computed anywhere.
 *
 * And a second input, "Advance tax already paid", which fed a `remaining`
 * value that was never rendered. An owner could type ₹80,000 into it and watch
 * nothing on the screen change at all.
 *
 * So the one question this page exists to answer — "I'm behind, what is that
 * costing me?" — was the one it would not answer, while naming the exact
 * section that answers it.
 *
 * The arithmetic now lives in lib/advance-tax.ts, which is pure and has 60
 * assertions against it, including the Department's own worked example and
 * both sides of the 12% cliff to the rupee. The schedule is imported rather
 * than copied, so there is one place for the law to live.
 *
 * WHAT IS ADDED, NOT REPLACED: every row, column and figure the old table
 * showed is still here. What is new is payment entry per date, the interest,
 * the presumptive schedule, and a marker for which instalment is next.
 */
/*
  The year's tax, computed from recorded profit using this repo's own slabs.

  The input here is "total tax for the year" — not profit — so seeding it
  means running the profit through lib/tax-slabs, the same module /tax uses.
  That is deliberate: two places computing Indian income tax is how two
  screens come to disagree about what someone owes, and this file's own
  header already argues for importing the schedule rather than copying it.

  THE ASSUMPTION, STATED ON SCREEN: individual slabs, new regime, no
  deductions. Right for a proprietor, wrong for a company. An owner who
  knows better overwrites one field; an owner who does not is told what was
  assumed rather than left to infer it from a number that looks official.
*/
export function AdvanceTax({ seed }: { seed?: WorkspaceSeed } = {}) {
  const seededTax = seed?.netProfitAnnual != null && seed.netProfitAnnual > 0
    ? Math.round(computeTax(seed.netProfitAnnual, "new", { salaried: false }).total)
    : null;
  const [tax, setTax] = useState(orDefault(seededTax, 240_000));
  const [presumptive, setPresumptive] = useState(false);

  /* Cumulative rupees paid by each due date, keyed by the date label. Starts
     empty — an owner who has paid nothing should see the full exposure, and
     one who has paid can fill in what they know. */
  const [paid, setPaid] = useState<Record<string, number>>({});

  const schedule = presumptive ? PRESUMPTIVE_SCHEDULE : SCHEDULE;

  const m = useMemo(() => computeAdvanceTax({
    tax,
    presumptive,
    payments: schedule.map((s) => ({ by: s.by, paidCumulative: paid[s.by] ?? 0 })),
  }), [tax, presumptive, paid, schedule]);

  /* Recomputed on every render rather than memoised on a date: the component
     is cheap and a memo keyed on nothing would go stale across midnight in a
     tab left open. */
  const next = nextInstalment(new Date(), presumptive);

  const anyPaid = Object.values(paid).some((v) => v > 0);

  return (
    <div className="space-y-4">
      <ExampleFigures
        source={seededTax != null ? "yours" : "example"}
        what="tax for the year"
        note="Computed from your recorded annual profit at individual new-regime slabs with no deductions. If you trade through a company, or claim deductions, replace it."
      />
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-muted-foreground">Estimated annual tax</span>
            <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring">
              <span className="text-xs text-muted-foreground">₹</span>
              <input type="number" value={tax} onChange={(e) => setTax(Number(e.target.value))}
                aria-label="Estimated annual tax"
                className="flex-1 bg-transparent text-sm outline-none" />
            </div>
          </label>
          <label className="flex items-start gap-2.5 sm:pt-6">
            <input type="checkbox" checked={presumptive} onChange={(e) => setPresumptive(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
            <span className="text-sm">
              I file under presumptive taxation (44AD / 44ADA)
              <span className="block text-xs text-muted-foreground">
                One instalment: the whole amount by 15 March.
              </span>
            </span>
          </label>
        </div>

        {m.belowThreshold ? (
          <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
            Advance tax only applies once your annual liability crosses {inr(ADVANCE_TAX_THRESHOLD)}.
            At {inr(tax)} you have no instalments to pay and no interest to worry about.
          </div>
        ) : next ? (
          <div className="rounded-lg border p-3 text-sm">
            Next instalment: <b>{next.by}</b>{" "}
            <span className="text-muted-foreground">
              {next.daysAway === 0 ? "— today" : `— in ${next.daysAway} day${next.daysAway === 1 ? "" : "s"}`}
            </span>
          </div>
        ) : (
          <div className="rounded-lg border p-3 text-sm text-muted-foreground">
            All instalment dates for this financial year have passed.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3 font-medium">Due by</th>
                <th className="py-2 pr-3 font-medium">Cumulative</th>
                <th className="py-2 pr-3 font-medium text-right">Pay by this date</th>
                <th className="py-2 pr-3 font-medium text-right">This instalment</th>
                <th className="py-2 pr-3 font-medium text-right">Paid by then</th>
                <th className="py-2 font-medium text-right">Interest (234C)</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.by} className={`border-b last:border-0 ${next?.by === r.by ? "bg-primary/5" : ""}`}>
                  <td className="py-2 pr-3 font-medium">{r.by}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.pct.toFixed(0)}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{inr(r.dueCumulative)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium">{inr(r.instalment)}</td>
                  <td className="py-2 pr-3 text-right">
                    <input
                      type="number"
                      value={paid[r.by] ?? ""}
                      placeholder="0"
                      aria-label={`Cumulative advance tax paid by ${r.by}`}
                      onChange={(e) => setPaid((p) => ({ ...p, [r.by]: Number(e.target.value) || 0 }))}
                      className="w-28 rounded-md border bg-background px-2 h-8 text-sm text-right outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td className={`py-2 text-right tabular-nums ${r.interest > 0 ? "text-danger font-medium" : "text-muted-foreground"}`}>
                    {r.interest > 0 ? inr(r.interest) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* The tolerance is worth naming when it is what saved them, because it
            is counter-intuitive: 13% by 15 June costs nothing while 11% is
            charged on the gap from 15%, not from 12%. */}
        {m.rows.some((r) => r.withinTolerance && r.paidCumulative < r.dueCumulative && r.paidCumulative > 0) && (
          <p className="text-xs text-muted-foreground">
            You are short of the target on at least one date but inside the statutory tolerance
            (12% by 15 June, 36% by 15 September), so no interest is charged there.
          </p>
        )}
      </Card>

      {!m.belowThreshold && (
        <Card className="p-5 space-y-3">
          <div className="font-semibold">What a shortfall costs</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Stat
              label="Interest under 234C"
              value={inr(m.interest234C)}
              tone={m.interest234C > 0 ? "bad" : "good"}
              sub="Deferment within the year"
            />
            <Stat
              label="Still unpaid"
              value={inr(m.unpaid)}
              tone={m.unpaid > 0 ? "warn" : "good"}
              sub={anyPaid ? "After what you entered above" : "Nothing entered as paid yet"}
            />
            <Stat
              label="234B accrues at"
              value={m.interest234B.applies ? `${inr(m.interest234B.perMonth)}/mo` : "—"}
              tone={m.interest234B.applies ? "bad" : "good"}
              sub={m.interest234B.applies
                ? `On ${inr(m.interest234B.principal)}, from 1 April`
                : "You are at or above 90% — 234B does not apply"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            <b>234C</b> is a fixed charge for paying an instalment late: 1% a month for three months on each of the
            first three shortfalls, one month on the last. It is final once the date passes.
            {" "}
            <b>234B</b> is different — it applies only if your advance tax came to less than 90% of the year&apos;s
            liability, and it runs at 1% a month from 1 April until you actually pay. We show the monthly rate rather
            than a total, because the total depends on a date only you know.
          </p>
        </Card>
      )}

      <Card className="p-5 text-sm text-muted-foreground space-y-2">
        <p>
          Advance tax is due when your annual tax liability exceeds ₹10,000. Pay 15% by 15 Jun, 45% (cumulative) by
          15 Sep, 75% by 15 Dec and 100% by 15 Mar. Shortfalls attract interest under sections 234B/234C.
          Presumptive taxpayers (44AD/44ADA) can pay 100% by 15 Mar in one go.
        </p>
        <p className="text-xs">{ADVANCE_TAX_SECTION_NOTE}</p>
        <p className="text-xs">{ADVANCE_TAX_AS_OF}. This is a calculator, not tax advice — check the figures with your CA before you pay.</p>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const c = tone === "bad" ? "text-danger" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
