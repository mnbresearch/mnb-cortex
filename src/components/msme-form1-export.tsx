"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet,
  Download,
  AlertTriangle,
  Scale,
  Calendar,
  FileCheck2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  type DelayedBill,
  type MsmeForm1Report,
  generateMsmeForm1Report,
  STATUTORY_PENAL_RATE_PCT,
} from "@/lib/msme-form1";

export interface MsmeForm1ExportProps {
  bills: DelayedBill[];
  className?: string;
}

export function MsmeForm1Export({ bills, className }: MsmeForm1ExportProps) {
  const [report, setReport] = useState<MsmeForm1Report>(() => generateMsmeForm1Report(bills));
  const [showTable, setShowTable] = useState(false);

  function downloadCsv() {
    const blob = new Blob([report.mcaCsvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `MCA_Form_MSME_1_${report.period}_${report.financialYear.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const formatRupee = (amt: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amt);

  if (report.totalDelayedInvoicesCount === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-5 flex items-center gap-3 text-sm text-muted-foreground">
          <FileCheck2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <span className="font-semibold text-foreground">No Delayed MSME Liabilities:</span> All supplier payments to registered micro and small enterprises are currently within statutory timelines. No MCA Form MSME-1 filing required.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">MCA Form MSME-1 &amp; Section 16 Penal Interest</CardTitle>
              <CardDescription>
                Statutory half-yearly return for Registrar of Companies (ROC) &bull; {report.period} {report.financialYear}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Due: {report.filingDueDate}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Delayed Suppliers</div>
            <div className="text-xl font-bold font-mono mt-0.5">{report.totalSuppliersCount}</div>
            <div className="text-[10px] text-muted-foreground">{report.totalDelayedInvoicesCount} overdue bills</div>
          </div>
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Principal Past Window</div>
            <div className="text-xl font-bold font-mono text-danger mt-0.5">{formatRupee(report.totalPrincipalDue)}</div>
            <div className="text-[10px] text-muted-foreground">Subject to 43B(h) addback</div>
          </div>
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold flex items-center gap-1">
              <Scale className="h-3 w-3 text-primary" /> Sec 16 Penal Interest
            </div>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {formatRupee(report.totalPenalInterestAccrued)}
            </div>
            <div className="text-[10px] text-muted-foreground">@{STATUTORY_PENAL_RATE_PCT}% p.a. (3x Bank Rate)</div>
          </div>
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold">Total Claim Liability</div>
            <div className="text-xl font-bold font-mono mt-0.5">{formatRupee(report.grandTotalLiability)}</div>
            <div className="text-[10px] text-muted-foreground">Principal + Compounded Interest</div>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border bg-muted/30">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <span>Filing mandatory under Section 405 Companies Act to avoid ROC non-compliance penalties.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTable(!showTable)}
              className="text-xs h-8 gap-1"
            >
              {showTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showTable ? "Hide Entries" : "View Details"}
            </Button>
            <Button
              size="sm"
              onClick={downloadCsv}
              className="text-xs h-8 gap-1.5 bg-primary text-primary-foreground hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" /> Export MCA Form MSME-1 (CSV)
            </Button>
          </div>
        </div>

        {/* Entries Table Drawer */}
        {showTable && (
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2.5 font-medium">Supplier</th>
                    <th className="p-2.5 font-medium">Inv #</th>
                    <th className="p-2.5 font-medium">Due Date</th>
                    <th className="p-2.5 font-medium text-right">Delay</th>
                    <th className="p-2.5 font-medium text-right">Principal</th>
                    <th className="p-2.5 font-medium text-right">Sec 16 Interest</th>
                    <th className="p-2.5 font-medium">Stated Reason for Delay</th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((e, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2.5 font-medium">{e.supplierName}</td>
                      <td className="p-2.5 font-mono">{e.invoiceNo}</td>
                      <td className="p-2.5">{e.dueDate}</td>
                      <td className="p-2.5 text-right font-mono text-danger font-semibold">{e.daysDelayed}d</td>
                      <td className="p-2.5 text-right font-mono">{formatRupee(e.principalAmount)}</td>
                      <td className="p-2.5 text-right font-mono text-amber-600 dark:text-amber-400">
                        {formatRupee(e.penalInterestAccrued)}
                      </td>
                      <td className="p-2.5 text-muted-foreground max-w-xs truncate">{e.reasonForDelay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
