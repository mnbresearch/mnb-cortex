/*
  ONE BANNER FOR EVERY CALCULATOR THAT SHIPS A PRE-FILLED BUSINESS.

  The calculators open with plausible numbers already in the fields — a stocked
  warehouse, a staffed team, a loan book — so the page is immediately legible
  instead of being a wall of zeros. That is a reasonable design choice, and the
  arithmetic on top of it is correct.

  The problem was the sentence around the arithmetic. These components state
  their output in the second person: "You sell through your stock 6.0 times a
  year", "Only about 65% of your time is billable", "Your loans · total
  ₹26,00,000", "Yours looks strong — you can afford to invest more in
  acquisition". A handful carried a label saying the figures were examples;
  most did not, and the ones that did not were indistinguishable on screen from
  the pages that render the customer's real ledger.

  An owner who has just seen a real receivables figure on /finance has no way
  to know that the ₹36 L net worth on the next page is fiction. The fix is not
  to remove the defaults — it is to say, once, at the top, in the same place
  every time, that nothing here has been read from their account until they
  type it.

  `source` distinguishes the two honest states:
    "example"  — nothing real was available; these numbers are invented.
    "yours"    — the figures were seeded from the workspace's own rows.
*/
export function ExampleFigures({
  source = "example",
  what = "figures",
  hint,
}: {
  source?: "example" | "yours";
  what?: string;
  hint?: string;
}) {
  if (source === "yours") {
    return (
      <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
        These {what} come from <b>your workspace</b>. Editing them here changes only this calculation.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      The {what} below are an <b>example, not your business</b> — nothing here has been read from your account.
      Change them to your own and every number on this page recalculates.
      {hint ? <> {hint}</> : null}
    </div>
  );
}
