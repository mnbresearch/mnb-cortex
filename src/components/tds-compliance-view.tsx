"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  evaluateTdsBatch,
  calculateSection201PenalInterest,
  type TdsDeducteeRecord,
} from "@/lib/tds-compliance";
import { inr } from "@/lib/utils";
import { AlertCircle, ShieldAlert, CheckCircle2, Calendar, FileText } from "lucide-react";

const SAMPLE_TDS_RECORDS: TdsDeducteeRecord[] = [
  {
    vendorName: "Delta Tech Consultancy",
    pan: "ABCDE1234F",
    sectionCode: "194J",
    paymentAmount: 250000,
    paymentDate: "2026-09-15",
    isSpecifiedPerson206AB: false,
  },
  {
    vendorName: "Kailash Logistics & Transport",
    pan: "AABCK5678G",
    sectionCode: "194C",
    paymentAmount: 400000,
    paymentDate: "2026-09-18",
    isSpecifiedPerson206AB: true, // Section 206AB Non-filer -> higher of (2x2%=4%, 5%) = 5%
  },
  {
    vendorName: "Shree Ganesh Security Services",
    pan: "PAN_NOT_PROVIDED", // Section 206AA No PAN -> 20%
    sectionCode: "194C-ind",
    paymentAmount: 120000,
    paymentDate: "2026-09-22",
  },
  {
    vendorName: "Prime Space Realty",
    pan: "AAACP9012H",
    sectionCode: "194I-land",
    paymentAmount: 180000,
    paymentDate: "2026-09-28",
    isSpecifiedPerson206AB: false,
  },
  {
    vendorName: "Horizon Digital Media",
    pan: "AAACH3456J",
    sectionCode: "194H",
    paymentAmount: 85000,
    paymentDate: "2026-09-30",
    isSpecifiedPerson206AB: true, // Non-filer -> higher of (2x2%=4%, 5%) = 5%
  },
];

export function TdsComplianceView() {
  const [records] = useState<TdsDeducteeRecord[]>(SAMPLE_TDS_RECORDS);
  const [filter, setFilter] = useState<"ALL" | "206AB" | "NO_PAN">("ALL");

  // Section 201 late deposit simulator
  const [simTds, setSimTds] = useState(50000);
  const [simDeductionDate, setSimDeductionDate] = useState("2026-08-15");
  const [simDepositDate, setSimDepositDate] = useState("2026-10-25");

  const batchResult = useMemo(() => {
    return evaluateTdsBatch(records);
  }, [records]);

  const interestResult = useMemo(() => {
    return calculateSection201PenalInterest(simTds, simDeductionDate, simDepositDate);
  }, [simTds, simDeductionDate, simDepositDate]);

  const filteredItems = useMemo(() => {
    if (filter === "206AB") return batchResult.items.filter((i) => i.isHigherRate206AB);
    if (filter === "NO_PAN") return batchResult.items.filter((i) => i.isNoPanPenalty206AA);
    return batchResult.items;
  }, [batchResult, filter]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">TDS Statutory Audit</span>
              <span className="rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Section 206AB & 201 Defense</span>
            </div>
            <h3 className="mt-1 font-semibold text-foreground text-base sm:text-lg">
              Section 206AB Non-Filer Withholding & Challan Compliance
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
              Under Section 206AB, buyers must deduct tax at the higher of 2x normal rate or 5% if the vendor hasn&rsquo;t filed ITR and had &ge; ₹50,000 TDS in prior year. Failure to deduct triggers 30% expense disallowance under Section 40(a)(ia).
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Total Deductible TDS</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-foreground tabular-nums">{inr(batchResult.totalTds)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Deposit via ITNS 281</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Net Payable to Vendors</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-success tabular-nums">{inr(batchResult.totalNetPayable)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Post-withholding disbursements</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Sec 206AB Higher Rate</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-warning tabular-nums">{batchResult.nonFilerCount} Vendors</div>
          <div className="mt-0.5 text-[11px] text-warning">Deducted at 2x or 5%</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Missing / Invalid PAN</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-danger tabular-nums">{batchResult.noPanCount} Vendors</div>
          <div className="mt-0.5 text-[11px] text-danger">Sec 206AA 20% penalty applied</div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            filter === "ALL" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All Deductions ({batchResult.items.length})
        </button>
        <button
          onClick={() => setFilter("206AB")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            filter === "206AB" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Sec 206AB Non-Filers ({batchResult.nonFilerCount})
        </button>
        <button
          onClick={() => setFilter("NO_PAN")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            filter === "NO_PAN" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Missing PAN ({batchResult.noPanCount})
        </button>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground border-b font-medium">
              <tr>
                <th className="px-3.5 py-2.5">Vendor & PAN</th>
                <th className="px-3.5 py-2.5">Section</th>
                <th className="px-3.5 py-2.5 text-right">Payment</th>
                <th className="px-3.5 py-2.5 text-right">Base %</th>
                <th className="px-3.5 py-2.5 text-right">Effective %</th>
                <th className="px-3.5 py-2.5 text-right">TDS to Deposit</th>
                <th className="px-3.5 py-2.5 text-right">Net to Vendor</th>
                <th className="px-3.5 py-2.5">Challan Due Date</th>
                <th className="px-3.5 py-2.5">Statutory Defense</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item, idx) => (
                <tr key={`${item.vendorName}-${idx}`} className="hover:bg-muted/20">
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <div className="font-semibold text-foreground">{item.vendorName}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{item.pan}</div>
                  </td>
                  <td className="px-3.5 py-2.5 uppercase font-medium">{item.sectionCode}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{inr(item.tdsDeductible + item.netPayableToVendor)}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-muted-foreground">{item.baseRatePct}%</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums font-bold">
                    {item.effectiveRatePct}%
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold text-danger">
                    {inr(item.tdsDeductible)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-success">
                    {inr(item.netPayableToVendor)}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap tabular-nums font-mono text-muted-foreground">
                    {item.challanDueDate}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    {item.isHigherRate206AB && (
                      <span className="rounded bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning flex items-center gap-1 w-fit">
                        <AlertCircle className="h-3 w-3" /> Sec 206AB 2x Rate
                      </span>
                    )}
                    {item.isNoPanPenalty206AA && (
                      <span className="rounded bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger flex items-center gap-1 w-fit">
                        <ShieldAlert className="h-3 w-3" /> Sec 206AA 20% No PAN
                      </span>
                    )}
                    {!item.isHigherRate206AB && !item.isNoPanPenalty206AA && (
                      <span className="rounded bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success flex items-center gap-1 w-fit">
                        <CheckCircle2 className="h-3 w-3" /> Standard Rate
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 201 Delay & Interest Simulator */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Section 201(1A) Late Deposit Interest Calculator</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Under Section 201(1A)(ii), if TDS is deducted on time but deposited past the 7th of next month, simple interest of <strong>1.5% per month or part of a month</strong> is charged from the date of deduction until actual deposit.
        </p>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">TDS Amount (₹)</label>
            <input
              type="number"
              value={simTds}
              onChange={(e) => setSimTds(Number(e.target.value))}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Deduction Date</label>
            <input
              type="date"
              value={simDeductionDate}
              onChange={(e) => setSimDeductionDate(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Actual Deposit Date</label>
            <input
              type="date"
              value={simDepositDate}
              onChange={(e) => setSimDepositDate(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t pt-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Statutory Due Date</div>
            <div className="font-mono text-xs font-semibold">{interestResult.challanDueDate}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Delay Status</div>
            <div className={`text-xs font-semibold ${interestResult.isDelayed ? "text-danger" : "text-success"}`}>
              {interestResult.isDelayed ? `Delayed (${interestResult.monthsDelay} months)` : "On Time (Nil Interest)"}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Sec 201(1A) Interest</div>
            <div className="text-xs font-bold text-danger tabular-nums">{inr(interestResult.penalInterest)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Total Challan Payable</div>
            <div className="text-xs font-bold text-primary tabular-nums">{inr(interestResult.totalDepositPayable)}</div>
          </div>
        </div>
      </Card>

      {/* Statutory Guidance */}
      <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">Statutory Notes for Deductors:</div>
        <div>1. <strong>Quarterly Return Deadlines:</strong> Form 26Q must be filed by 31st July (Q1), 31st October (Q2), 31st January (Q3), and 31st May (Q4). Delayed returns attract Section 234E fee of ₹200/day.</div>
        <div>2. <strong>Section 40(a)(ia) Disallowance:</strong> 30% of any expenditure where TDS was not deducted or not deposited before the ITR filing due date is disallowed from business expenditure and added back to taxable income.</div>
      </div>
    </div>
  );
}
