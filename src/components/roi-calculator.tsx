"use client";
import { useState } from "react";
import { PLANS } from "@/lib/config";

/*
  ==========================================================================
  THIS COMPONENT USED TO INVENT TWO NUMBERS AND PRINT THEM IN BOLD
  ==========================================================================

  It was:

    const hoursSaved    = Math.round(hrs * 0.45 * 52);
    const decisionValue = Math.round(rev * 100 * 0.03);  // ~3% of revenue

  A 45% reduction in reporting hours and a 3%-of-revenue uplift from "faster,
  better decisions". Neither constant has a source anywhere in this repo, no
  telemetry supports them, and the second was rendered as a large green rupee
  figure — "≈ ₹6 L" for a ₹2 crore business — on the public pricing page.
  "Illustrative estimate" sat under it in 11px.

  This is the same class of claim the repo already deleted once: the "₹8.4L
  recovered" line and the three invented testimonials both went for exactly
  this reason (unsubstantiated performance claims; ASCI expects
  substantiation on demand). This one survived because it moved pages rather
  than being re-read.

  ==========================================================================
  WHAT IT DOES NOW
  ==========================================================================

  The tool is kept — a visitor working out whether this is worth ₹4,999 a
  month is doing something reasonable, and helping them is not the problem.
  What changed is WHOSE numbers appear:

    1. THE SAVING FRACTION IS NOW AN INPUT. It is the visitor's estimate of
       how much of their reporting time this removes, set with a slider and
       labelled as theirs. Cortex asserts nothing. The output is arithmetic
       on three numbers they chose.

    2. THE "DECISION UPSIDE" IS GONE. Not reworded — removed. There is no
       basis for it of any kind, and unlike the hours figure there is no
       honest version, because no input the visitor could supply would make
       "3% of revenue from better decisions" into their own claim rather
       than ours.

    3. THE MONEY SIDE IS NOW A REAL PRICE. What the cheapest plan costs a
       year, read from PLANS. That is a fact, it is the number the visitor
       is actually weighing, and it cannot go stale against the pricing
       table beside it.

  The hourly rate is theirs too, so "what those hours are worth" is their
  arithmetic end to end.
*/

const cheapestAnnual = () => {
  const live = PLANS.filter((p) => p.annual > 0);
  return live.length ? Math.min(...live.map((p) => p.annual)) : 0;
};

export function RoiCalculator() {
  const [hrs, setHrs] = useState(12);          // hrs/week the visitor spends
  const [share, setShare] = useState(40);      // % of that THEY think goes away
  const [rate, setRate] = useState(500);       // ₹/hour, their own figure

  const hoursSaved = Math.round(hrs * (share / 100) * 52);
  const worth = hoursSaved * rate;
  const cost = cheapestAnnual();

  const S = ({ label, value, min, max, step = 1, set, suffix = "" }: {
    label: string; value: number; min: number; max: number; step?: number;
    set: (n: number) => void; suffix?: string;
  }) => (
    <label className="text-sm block">
      {label}: <b>{value.toLocaleString("en-IN")}{suffix}</b>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(+e.target.value)}
        aria-label={label}
        className="w-full accent-[hsl(var(--primary))] mt-1"
      />
    </label>
  );

  return (
    <div className="rounded-2xl border bg-card p-6 max-w-2xl mx-auto">
      <h3 className="font-semibold text-lg">Work out whether it pays for itself</h3>
      <p className="text-sm text-muted-foreground mt-1">
        All three sliders are yours. We do not supply a saving figure, because we have no
        measurement to base one on — this is your arithmetic, not our claim.
      </p>

      <div className="grid sm:grid-cols-3 gap-5 mt-4">
        {S({ label: "Hours a week on manual reports", value: hrs, min: 1, max: 40, set: setHrs })}
        {S({ label: "Share of that you think this removes", value: share, min: 0, max: 100, step: 5, set: setShare, suffix: "%" })}
        {S({ label: "What an hour is worth to you", value: rate, min: 100, max: 5000, step: 100, set: setRate, suffix: " ₹" })}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
          <div className="text-2xl font-bold text-primary">{hoursSaved.toLocaleString("en-IN")} hrs/yr</div>
          <div className="text-xs text-muted-foreground">on your own estimate above</div>
        </div>
        <div className="rounded-xl bg-secondary border p-4">
          <div className="text-2xl font-bold">₹{worth.toLocaleString("en-IN")}</div>
          <div className="text-xs text-muted-foreground">
            what those hours are worth at your rate{cost > 0 && <> · the cheapest plan is ₹{cost.toLocaleString("en-IN")}/yr</>}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Every figure here is one you set. Cortex publishes no time-saving or revenue-uplift
        percentage, because it does not measure one.
      </p>
    </div>
  );
}
