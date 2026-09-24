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
  note,
  stillExample,
}: {
  source?: "example" | "yours";
  what?: string;
  hint?: string;
  /*
    A caveat on the SEEDED figures — shown only in the "yours" branch.

    "Comes from your workspace" is a strong claim and several calculators can
    only honour it approximately. /ccc asks for AVERAGE receivables over a
    period and the workspace stores the CURRENT open balance; /runway seeds a
    cash figure that belongs to the month of the last bank statement, not to
    today. Both are the right number to start from and neither is exactly the
    quantity the field is labelled with.

    Without somewhere to say that, the choice was between seeding nothing —
    leaving the page inventing a business, which is worse — and a green banner
    that slightly overstates what was read. This is the third option.
  */
  note?: string;
  /*
    THE FIELDS ON THIS PAGE THAT ARE *STILL* INVENTED.

    Some calculators sit halfway. /ratios takes ten inputs and Cortex can
    honestly supply three of them — revenue, stock and net profit come from
    the ledger, while equity, total assets, long-term debt and interest have
    no home in the product at all, because there is no balance sheet.

    That leaves three bad options and one good one:

      seed nothing         the page keeps inventing a whole company (status quo)
      seed three, say
        "from your
         workspace"        a green banner over a report that is 70% fiction,
                           and this page GRADES its output good/warn/bad and
                           offers to have an AI analyse it. The worst of the
                           four by some distance.
      seed all ten         impossible; four of them do not exist anywhere.
      seed three and
        name the other
        seven              <- this

    So when `stillExample` is non-empty the banner is amber rather than green
    and lists, by name, every field the reader must not trust. A reader who
    knows which four numbers are made up can fix those four and have a real
    report. A reader told "these come from your workspace" cannot.
  */
  stillExample?: string[];
}) {
  if (source === "yours") {
    const partial = (stillExample?.length ?? 0) > 0;
    return (
      <div className={
        partial
          ? "rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
          : "rounded-lg border border-success/30 bg-success/10 p-3 text-sm"
      }>
        {partial ? (
          <>
            <b>Partly yours.</b> Cortex filled in what it holds; <b>{stillExample!.join(", ")}</b>{" "}
            {stillExample!.length === 1 ? "is" : "are"} still an example, because your workspace has no
            record of {stillExample!.length === 1 ? "it" : "them"}. Replace{" "}
            {stillExample!.length === 1 ? "it" : "those"} with your own before relying on anything below.
          </>
        ) : (
          <>These {what} come from <b>your workspace</b>. Editing them here changes only this calculation.</>
        )}
        {note ? <span className="text-muted-foreground"> {note}</span> : null}
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
