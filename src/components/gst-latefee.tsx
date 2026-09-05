"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

/**
 * GSTR-3B late fee and interest.
 *
 * WHAT WAS WRONG.
 *
 * The cap was a flat ₹10,000 for everybody. Section 47's cap is turnover-linked
 * (CBIC notification 20/2021), and nil returns have a much lower one:
 *
 *   nil return                            ₹500      <- was ₹10,000
 *   AATO up to ₹1.5 crore                 ₹2,000    <- was ₹10,000
 *   AATO ₹1.5 crore to ₹5 crore           ₹5,000    <- was ₹10,000
 *   AATO above ₹5 crore                   ₹10,000
 *
 * There was no turnover input at all, so the correct cap was not even
 * computable. The error is worst exactly where it hurts most: a small business
 * that forgot a nil return for a year was shown ₹7,300 of late fee against a
 * true liability of ₹500 — fourteen times over, on the taxpayer whose cash
 * position is tightest and who is least likely to have a CA to correct it.
 *
 * A note on the daily rate. The ₹50 and ₹20 figures are the COMBINED CGST+SGST
 * amounts (₹25+₹25 and ₹10+₹10). The caps above are likewise combined totals.
 * Mixing a per-Act cap with a combined daily rate is the usual way these
 * calculators go wrong by 2x, so both sides are stated in combined terms here
 * and the split is shown separately.
 */

/** Rendered on screen. Every number here moves by notification, not by statute. */
const RATES_AS_OF = "CBIC notification 20/2021, current to September 2026";

const TURNOVER_BANDS = [
  { label: "Up to ₹1.5 crore", cap: 2_000 },
  { label: "₹1.5 crore to ₹5 crore", cap: 5_000 },
  { label: "Above ₹5 crore", cap: 10_000 },
] as const;

/** Nil returns: ₹20/day, capped at ₹500 total. Not turnover-linked. */
const NIL_CAP = 500;

export function GstLateFee() {
  const [taxDue, setTaxDue] = useState(120_000);
  const [days, setDays] = useState(20);
  const [nil, setNil] = useState(false);
  const [band, setBand] = useState(0);

  const m = useMemo(() => {
    const d = Math.max(days, 0);
    const perDay = nil ? 20 : 50;
    const rawFee = perDay * d;

    const cap = nil ? NIL_CAP : TURNOVER_BANDS[band].cap;
    const lateFee = Math.min(rawFee, cap);

    /* Interest under s.50 runs at 18% p.a. on the tax paid late. A nil return
       has no tax, so no interest — only the fee. */
    const interest = nil ? 0 : Math.round(taxDue * 0.18 * (d / 365));

    return {
      perDay, rawFee, cap, lateFee, interest,
      /* The tax itself is not a penalty. Keeping it out of this figure and
         showing it as its own line stops "Total to pay" reading as if the
         penalty were ₹1.2 lakh. */
      penalty: lateFee + interest,
      total: lateFee + interest + (nil ? 0 : Math.max(taxDue, 0)),
      capped: rawFee > lateFee,
    };
  }, [taxDue, days, nil, band]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {F("Tax payable", taxDue, setTaxDue)}
          {F("Days late", days, setDays, "#")}
          <label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={nil} onChange={(e) => setNil(e.target.checked)} className="h-4 w-4" /> Nil return (no tax)</label>
        </div>

        {/* The cap cannot be computed without this, which is why it is not optional. */}
        {!nil && (
          <label className="block max-w-sm">
            <span className="text-sm text-muted-foreground">Annual aggregate turnover (sets the cap)</span>
            <select
              value={band}
              onChange={(e) => setBand(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {TURNOVER_BANDS.map((b, i) => (
                <option key={b.label} value={i}>{b.label} — cap {inr(b.cap)}</option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Late fee / day" value={`₹${m.perDay}`} />
          <Stat label="Late fee" value={inr(m.lateFee)} cls={m.capped ? "text-success" : ""} />
          <Stat label="Interest (18% p.a.)" value={inr(m.interest)} />
          <Stat label="Late fee + interest" value={inr(m.penalty)} highlight />
        </div>

        {m.capped && (
          /* Capping is good news — say the uncapped figure so the user can see
             the cap did something, rather than a bare "capped" with no number. */
          <p className="text-xs text-success">
            {inr(m.rawFee)} at ₹{m.perDay}/day is capped at {inr(m.cap)}
            {nil ? " for a nil return." : " for your turnover band."}
          </p>
        )}

        {!nil && (
          <p className="text-xs text-muted-foreground">
            Plus the tax itself, {inr(Math.max(taxDue, 0))} — total remittance {inr(m.total)}.
          </p>
        )}
      </Card>

      <Card className="p-5 text-sm text-muted-foreground space-y-2">
        <p>
          GSTR-3B late fee is ₹50/day (₹25 CGST + ₹25 SGST), or ₹20/day (₹10 + ₹10) for nil returns.
          The maximum is ₹500 for a nil return, and otherwise {inr(2000)} / {inr(5000)} / {inr(10000)} by
          annual aggregate turnover. Interest runs at 18% p.a. under section 50 on the tax paid late.
        </p>
        <p>
          <b>{RATES_AS_OF}.</b> Amnesty and reduced-fee schemes for specific periods can lower this further,
          and GSTR-1, GSTR-9 and GSTR-4 have their own caps — confirm the exact figure on the GST portal before paying.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
