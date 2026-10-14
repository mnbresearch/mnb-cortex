"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";
import { ExampleFigures } from "@/components/example-figures";
import { orDefault, seedSource, type WorkspaceSeed } from "@/lib/seed-types";
import { projectRunway } from "@/lib/money-rules";

/*
  SEEDED FROM THE BANK STATEMENT CORTEX ALREADY READ.

  This page asked an owner for a cash balance that the product had already
  extracted from their statement and posted to the finance ledger, and then
  stated a runway in months off whatever they typed.

  TWO THINGS THE SEED MUST NOT DO HERE, both of which would be worse than the
  invented defaults:

  1. Seed 0 cash. `null` means the workspace has no analysed statement — a
     genuine unknown. Seeding 0 would print "Out of cash: this month" and a
     runway of zero at an owner who is perfectly solvent. `orDefault` treats
     null as absent, so an unseeded field keeps its example value and the
     banner stays grey.

  2. Present a stale balance as today's. A cash balance belongs to the month of
     the statement it came from. lib/metrics.ts documents the same bug on the
     dashboard — a March statement printed as the September position — and the
     seed carries `cashAsOf` precisely so this page can name the month rather
     than quietly implying "now". The projection genuinely starts from that
     balance, so the caveat is not a disclaimer on a good number; it is the
     number's definition.
*/
export function CashRunway({ seed }: { seed?: WorkspaceSeed } = {}) {
  const [cash, setCash] = useState(orDefault(seed?.cash, 8_000_000));
  const [burn, setBurn] = useState(orDefault(seed?.monthlyCost, 2_200_000));
  const [revenue, setRevenue] = useState(orDefault(seed?.monthlyRevenue, 1_400_000));
  /* Growth is a forecast assumption, not a recorded fact — there is nothing in
     the workspace that means "what I expect next month", so this one field
     stays an assumption the owner sets. */
  const [growth, setGrowth] = useState(6);

  const source = seedSource(seed, "cash", "monthlyCost", "monthlyRevenue");
  /*
    NAME THE FIELDS THAT ARE STILL EXAMPLES.

    `seedSource` says "yours" when ANY of the three landed. A workspace with a
    real bank balance and no recorded costs got its real cash divided by the
    invented ₹22 L burn and ₹14 L revenue — under a green "these come from
    your workspace" banner. Burn in particular is almost never known: a bank
    statement's money-out includes loan repayments and transfers, so Cortex
    does not pretend it is operating burn. Every unseeded input is listed.
  */
  const stillExample = [
    seed?.cash == null ? "cash in bank" : "",
    seed?.monthlyCost == null ? "monthly burn" : "",
    seed?.monthlyRevenue == null ? "monthly revenue" : "",
  ].filter(Boolean);
  const note = [
    seed?.cashAsOf ? `Cash is your closing balance as at ${seed.cashAsOf}, not today` : "",
    seed?.cashAgeMonths && seed.cashAgeMonths >= 2
      ? `— about ${seed.cashAgeMonths} months old, so upload a newer statement before acting on the runway`
      : "",
    seed?.cashAsOf ? "." : "",
  ].filter(Boolean).join(" ") || undefined;

  const m = useMemo(() => {
    /* lib/money-rules.ts projectRunway: "out of cash" only if the simulated
       balance actually reaches zero. The old loop broke out on the first
       cash-positive month, judged profitability on month 0 alone, and printed
       "60" when it merely ran out of months to simulate. */
    const p = projectRunway({ cash, burn, revenue, growthPct: growth, horizon: 60 });
    const zeroDate = p.monthsToZero === null ? null : (() => {
      const d = new Date(); d.setMonth(d.getMonth() + p.monthsToZero!);
      return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    })();
    return { netBurn: p.netBurnNow, cashPositiveNow: p.netBurnNow <= 0, hitZero: p.hitZero, runway: p.monthsToZero, zeroDate, series: p.series };
  }, [cash, burn, revenue, growth]);

  const max = Math.max(...m.series, 1);
  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <ExampleFigures source={source} what="cash and burn figures" note={note} stillExample={stillExample} />
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {F("Cash in bank", cash, setCash)}
          {F("Monthly gross burn", burn, setBurn)}
          {F("Monthly revenue", revenue, setRevenue)}
          {F("Revenue growth /mo", growth, setGrowth, "%")}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Net burn / month (now)" value={m.cashPositiveNow ? "Cash positive" : inr(m.netBurn)} cls={m.cashPositiveNow ? "text-success" : "text-danger"} />
          <Stat label="Runway" value={m.hitZero ? `${m.runway} month${m.runway === 1 ? "" : "s"}` : "Beyond 5 years"} highlight />
          <Stat label="Out of cash" value={m.zeroDate ?? "Never (within 5 years)"} cls={m.hitZero ? "text-danger" : "text-success"} />
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">Projected cash balance</div>
        <div className="flex items-end gap-1 h-40">
          {m.series.map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-primary/70 min-w-[3px]" style={{ height: `${(v / max) * 100}%` }} title={`Month ${i}: ${inr(v)}`} />
          ))}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {!m.hitZero
            ? "At these inputs the balance does not reach zero within five years. Keep an eye on collection timing so book profit turns into real cash."
            : "Each bar is a month. When it hits zero you need fresh cash or profitability. Rule of thumb: start raising or cutting when runway falls under 6 months."}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
