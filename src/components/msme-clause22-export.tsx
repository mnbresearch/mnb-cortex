"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Download,
  Copy,
  Check,
  AlertTriangle,
  Scale,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileCheck2,
} from "lucide-react";
import {
  type Clause22BillInput,
  type Form3CdClause22Report,
  generateClause22Report,
} from "@/lib/msme-clause22";

export interface MsmeClause22ExportProps {
  bills: Clause22BillInput[];
  balanceSheetDate?: string;
  className?: string;
}

export function MsmeClause22Export({ bills, balanceSheetDate, className }: MsmeClause22ExportProps) {
  const [report, setReport] = useState<Form3CdClause22Report>(() =>
    generateClause22Report(bills, balanceSheetDate)
  );
  const [copied, setCopied] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [filter, setFilter] = useState<"all" | "disallowed" | "delayed_paid">("all");

  const formatRupee = (amt: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amt);

  function downloadCsv() {
    const blob = new Blob([report.csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `Tax_Audit_Form_3CD_Clause_22_${report.assessmentYear.replace(/\s+/g, "_")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function copyClause22Text() {
    const text = `TAX AUDIT REPORT (FORM 3CD) - CLAUSE 22 SCHEDULE
Assessment Year: ${report.assessmentYear} (${report.financialYear})
Reporting under Section 22 of the Micro, Small and Medium Enterprises Development Act, 2006:

(i) Principal amount and interest due thereon remaining unpaid to any supplier as at the end of accounting year:
    - Principal: ₹${report.disclosureSection22.principalUnpaidAtYearEnd.toLocaleString("en-IN")}
    - Interest: ₹${Math.round(report.disclosureSection22.interestDueUnpaidAtYearEnd).toLocaleString("en-IN")}

(ii) Amount of interest paid by the buyer in terms of Section 16 of the MSMED Act, 2006:
    - Interest Paid: ₹${report.disclosureSection22.interestPaidUnderSec16.toLocaleString("en-IN")}
    - Principal paid beyond appointed day during the year: ₹${report.disclosureSection22.delayedPaymentsMadeDuringYear.toLocaleString("en-IN")}

(iii) Amount of interest due and payable for the period of delay in making payment:
    - Interest Due: ₹${Math.round(report.disclosureSection22.interestDueForDelayedPaid).toLocaleString("en-IN")}

(iv) Amount of interest accrued and remaining unpaid at the end of each accounting year:
    - Interest Accrued & Unpaid: ₹${Math.round(report.disclosureSection22.interestAccruedUnpaidYearEnd).toLocaleString("en-IN")}

(v) Total interest inadmissible under Section 23 of the MSMED Act, 2006 (to be added back in computation of income):
    - Disallowance: ₹${Math.round(report.disclosureSection22.totalInterestInadmissibleSec23).toLocaleString("en-IN")}

--------------------------------------------------------------------------------
SECTION 43B(h) DISALLOWANCE SCHEDULE (CHAPTER IV-D):
- Total Purchases/Expenses Disallowed under Section 43B(h): ₹${report.section43BhDisallowance.totalDisallowedPurchases.toLocaleString("en-IN")}
- Number of Invoices Disallowed: ${report.section43BhDisallowance.billsDisallowedCount}
- Estimated Additional Tax Impact (at 31.2% incl. cess): ₹${report.section43BhDisallowance.potentialTaxImpactAt30Pct.toLocaleString("en-IN")}
--------------------------------------------------------------------------------
Generated autonomously by MNB Cortex Audit Engine.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const displayedRows = report.rows.filter((r) => {
    if (filter === "disallowed") return r.isDisallowed43Bh;
    if (filter === "delayed_paid") return r.clause22Status === "paid_delayed_same_fy";
    return true;
  });

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                Form 3CD Clause 22 &amp; Section 43B(h) Tax Audit Pack
              </CardTitle>
              <CardDescription>
                Statutory disclosures under Section 44AB read with MSMED Act Sec 22 &amp; 23 &bull; {report.assessmentYear} ({report.financialYear})
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyClause22Text} className="text-xs h-8 gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied Clause 22" : "Copy Schedule"}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv} className="text-xs h-8 gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download CA CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">43B(h) Disallowed</div>
            <div className="text-xl font-bold font-mono text-danger mt-0.5">
              {formatRupee(report.section43BhDisallowance.totalDisallowedPurchases)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {report.section43BhDisallowance.billsDisallowedCount} invoices overdue
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Tax Liability Impact</div>
            <div className="text-xl font-bold font-mono text-danger mt-0.5">
              {formatRupee(report.section43BhDisallowance.potentialTaxImpactAt30Pct)}
            </div>
            <div className="text-[10px] text-muted-foreground">At 31.2% (tax + 4% cess)</div>
          </div>
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Sec 23 Inadmissible Int.</div>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {formatRupee(report.disclosureSection22.totalInterestInadmissibleSec23)}
            </div>
            <div className="text-[10px] text-muted-foreground">Sec 16 compound penal rate</div>
          </div>
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Delayed Paid in FY</div>
            <div className="text-xl font-bold font-mono mt-0.5">
              {formatRupee(report.disclosureSection22.delayedPaymentsMadeDuringYear)}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Allowed as paid in FY</div>
          </div>
        </div>

        {/* ICAI Guidance Note Breakdown */}
        <div className="rounded-lg border p-3 bg-muted/20 space-y-2 text-xs">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-primary" /> ICAI Tax Audit Clause 22 Schedule Particulars
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <div>&bull; (i) Principal unpaid at year-end: <span className="font-mono text-foreground">{formatRupee(report.disclosureSection22.principalUnpaidAtYearEnd)}</span></div>
            <div>&bull; (i) Interest due &amp; unpaid at year-end: <span className="font-mono text-foreground">{formatRupee(report.disclosureSection22.interestDueUnpaidAtYearEnd)}</span></div>
            <div>&bull; (ii) Interest paid under Sec 16: <span className="font-mono text-foreground">{formatRupee(report.disclosureSection22.interestPaidUnderSec16)}</span></div>
            <div>&bull; (iii) Interest due on delayed payments: <span className="font-mono text-foreground">{formatRupee(report.disclosureSection22.interestDueForDelayedPaid)}</span></div>
            <div>&bull; (iv) Interest accrued &amp; unpaid at year-end: <span className="font-mono text-foreground">{formatRupee(report.disclosureSection22.interestAccruedUnpaidYearEnd)}</span></div>
            <div>&bull; (v) Further interest in succeeding years: <span className="font-mono text-foreground">₹0</span></div>
          </div>
        </div>

        {/* Drill-down Toggle */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-xs">
            <Button
              variant={filter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter("all")}
              className="h-7 text-xs"
            >
              All ({report.rows.length})
            </Button>
            <Button
              variant={filter === "disallowed" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter("disallowed")}
              className="h-7 text-xs text-danger"
            >
              43B(h) Disallowed ({report.section43BhDisallowance.billsDisallowedCount})
            </Button>
            <Button
              variant={filter === "delayed_paid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter("delayed_paid")}
              className="h-7 text-xs"
            >
              Paid Late in FY
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTable(!showTable)}
            className="text-xs h-7 gap-1 text-muted-foreground"
          >
            {showTable ? "Hide Schedule" : "View Schedule Table"}
            {showTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Drill-down Table */}
        {showTable && (
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b text-left">
                <tr>
                  <th className="p-2 font-medium">Supplier</th>
                  <th className="p-2 font-medium">Udyam</th>
                  <th className="p-2 font-medium">Invoice No</th>
                  <th className="p-2 font-medium text-right">Limit</th>
                  <th className="p-2 font-medium text-right">Amount</th>
                  <th className="p-2 font-medium text-right">Delay</th>
                  <th className="p-2 font-medium text-right">Sec 16 Interest</th>
                  <th className="p-2 font-medium">Audit Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedRows.map((r, idx) => (
                  <tr key={idx} className={r.isDisallowed43Bh ? "bg-danger/5" : undefined}>
                    <td className="p-2 font-medium">{r.party}</td>
                    <td className="p-2 capitalize text-muted-foreground">{r.udyamCategory}</td>
                    <td className="p-2 font-mono">{r.invoiceNo}</td>
                    <td className="p-2 text-right">{r.statutoryLimitDays}d</td>
                    <td className="p-2 text-right font-mono font-medium">{formatRupee(r.amount)}</td>
                    <td className="p-2 text-right font-mono">{r.actualDelayDays}d</td>
                    <td className="p-2 text-right font-mono text-amber-600 dark:text-amber-400">
                      {formatRupee(r.penalInterestSection16)}
                    </td>
                    <td className="p-2">
                      {r.isDisallowed43Bh ? (
                        <Badge className="bg-danger/10 text-danger border-danger/20 text-[10px]">
                          43B(h) Disallowed
                        </Badge>
                      ) : r.clause22Status === "paid_delayed_same_fy" ? (
                        <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                          Paid Late in FY
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                          Allowed
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
