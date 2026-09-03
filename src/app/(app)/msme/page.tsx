import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { getMsmeExposure, listVendors, COVERED } from "@/lib/msme";
import { VendorClassifier } from "@/components/vendor-classifier";
import { AlertTriangle, Info, HelpCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const rupee = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/**
 * MSME 45-day exposure — Section 43B(h).
 *
 * Nothing generic handles this, and every Indian SME finance conversation since
 * FY 2023-24 has been about it: pay a registered micro or small supplier late
 * and you lose the deduction for that expense in the year it was incurred.
 *
 * The page is built around one distinction, because getting it wrong makes the
 * feature actively harmful: ONLY micro and small are covered. A ninety-day-late
 * medium supplier carries no 43B(h) consequence, and counting them would inflate
 * a tax warning that an owner will act on.
 */
export default async function Msme() {
  const [exp, vendors] = await Promise.all([getMsmeExposure(), listVendors()]);

  return (
    <>
      <Topbar
        title="MSME 45-day exposure"
        subtitle="Section 43B(h) — deductions at risk from late supplier payments"
      />
      <PageShell>
        {!exp.live ? (
          <Card className="p-5 text-sm text-muted-foreground">
            Sign in to a workspace with supplier bills to see your exposure.
          </Card>
        ) : (
          <>
            {/*
              The honest headline. A workspace that has classified nothing gets
              "unknown", never a reassuring zero — that false reassurance is the
              single worst outcome this page could produce.
            */}
            {exp.nothingClassified ? (
              <Card className="p-5 border-warning/30 bg-warning/5 flex items-start gap-3">
                <HelpCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="font-medium">Your exposure is unknown, not zero.</div>
                  <p className="text-muted-foreground mt-1 leading-6">
                    43B(h) applies only to suppliers registered under Udyam as <b>micro</b> or <b>small</b>.
                    None of your {vendors.length} supplier{vendors.length === 1 ? "" : "s"} has been classified yet,
                    so Cortex cannot tell which of your {rupee(exp.totalPayable)} in unpaid bills is covered.
                    Classify them below — it takes a minute and only needs doing once.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-3 gap-3">
                <Card className={`p-4 ${exp.atRisk > 0 ? "border-danger/30 bg-danger/5" : ""}`}>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className={`h-4 w-4 ${exp.atRisk > 0 ? "text-danger" : "text-muted-foreground"}`} />
                    Deduction at risk
                  </div>
                  <div className="text-2xl font-bold mt-1 tabular-nums">{rupee(exp.atRisk)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {exp.atRiskCount} bill{exp.atRiskCount === 1 ? "" : "s"} to micro/small suppliers past the window
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Late but not covered</div>
                  <div className="text-2xl font-bold mt-1 tabular-nums">{rupee(exp.notCovered)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Medium or unregistered — no 43B(h) effect
                  </div>
                </Card>
                <Card className={`p-4 ${exp.unclassified > 0 ? "border-warning/30 bg-warning/5" : ""}`}>
                  <div className="text-sm text-muted-foreground">Not yet classified</div>
                  <div className="text-2xl font-bold mt-1 tabular-nums">{rupee(exp.unclassified)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {exp.unclassifiedCount} bill{exp.unclassifiedCount === 1 ? "" : "s"} — status unknown
                  </div>
                </Card>
              </div>
            )}

            <Card className="p-4 text-sm flex items-start gap-2.5">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-muted-foreground leading-6">
                <span className="font-medium text-foreground">This is an exposure figure, not a tax computation.</span>{" "}
                It is the value of unpaid bills to micro and small suppliers that have passed the statutory window
                (45 days with a written agreement, 15 without). What is actually disallowed depends on your year end,
                when you pay, and your method of accounting. Confirm with your chartered accountant before filing.
              </div>
            </Card>

            {exp.rows.length > 0 && (
              <Section title="By supplier" desc="Covered and overdue first, then oldest">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-4 font-medium">Supplier</th>
                        <th className="py-2 pr-3 font-medium">Udyam</th>
                        <th className="py-2 pr-3 font-medium text-right">Unpaid</th>
                        <th className="py-2 pr-3 font-medium text-right">Oldest</th>
                        <th className="py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exp.rows.map((r) => {
                        const covered = COVERED.has(r.udyam_category);
                        const danger = covered && r.past_window;
                        return (
                          <tr key={r.party} className="border-b last:border-0">
                            <td className="py-2 pr-4">{r.party}</td>
                            <td className="py-2 pr-3 capitalize text-muted-foreground">{r.udyam_category.replace("_", " ")}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{rupee(r.total_amount)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{r.oldest_days}d</td>
                            <td className="py-2">
                              {danger ? (
                                <span className="rounded-full border border-danger/20 bg-danger/10 text-danger px-2 py-0.5 text-xs">
                                  Past {r.window_days}d — deduction at risk
                                </span>
                              ) : r.udyam_category === "unclassified" ? (
                                <span className="rounded-full border border-warning/20 bg-warning/10 text-warning px-2 py-0.5 text-xs">Classify to know</span>
                              ) : r.past_window ? (
                                <span className="text-xs text-muted-foreground">Late, not covered</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Within {r.window_days}d</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            <Section title="Classify your suppliers" desc="Only micro and small are covered by 43B(h)">
              <VendorClassifier vendors={vendors} />
            </Section>
          </>
        )}
      </PageShell>
    </>
  );
}
