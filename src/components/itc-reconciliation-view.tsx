"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  reconcileItc,
  generateItcReconciliationCsv,
  type PurchaseInvoiceRecord,
  type Gstr2bRecord,
  type ItcMatchStatus,
} from "@/lib/itc-reconciliation";
import { inr } from "@/lib/utils";

const SAMPLE_PURCHASE_REGISTER: PurchaseInvoiceRecord[] = [
  {
    invoiceNo: "INV-2026-001",
    invoiceDate: "2026-09-02",
    supplierGstin: "27AABCB1234A1Z5",
    supplierName: "Apex Steel Ltd",
    taxableValue: 500000,
    igst: 90000,
    cgst: 0,
    sgst: 0,
    totalTax: 90000,
    isBlocked17_5: false,
  },
  {
    invoiceNo: "INV-2026-002",
    invoiceDate: "2026-09-05",
    supplierGstin: "29BBBCB5678B1Z2",
    supplierName: "Bharat Fasteners",
    taxableValue: 200000,
    igst: 0,
    cgst: 18000,
    sgst: 18000,
    totalTax: 36000,
    isBlocked17_5: false,
  },
  {
    invoiceNo: "INV-2026-003",
    invoiceDate: "2026-09-12",
    supplierGstin: "07CCDCB9012C1Z8",
    supplierName: "Cloud Hosting Global",
    taxableValue: 100000,
    igst: 18000,
    cgst: 0,
    sgst: 0,
    totalTax: 18000,
    isBlocked17_5: false,
  },
  {
    invoiceNo: "INV-2026-004",
    invoiceDate: "2026-09-18",
    supplierGstin: "27EEDCB3456D1Z1",
    supplierName: "Luxury Car Fleet Co",
    taxableValue: 800000,
    igst: 144000,
    cgst: 0,
    sgst: 0,
    totalTax: 144000,
    isBlocked17_5: true, // Sec 17(5) Motor vehicle blocked
  },
  {
    invoiceNo: "INV-2026-005",
    invoiceDate: "2026-09-22",
    supplierGstin: "27FFFCB7890E1Z4",
    supplierName: "Delta Logistics",
    taxableValue: 50000,
    igst: 9000,
    cgst: 0,
    sgst: 0,
    totalTax: 9000,
    isBlocked17_5: false,
  },
];

const SAMPLE_GSTR2B: Gstr2bRecord[] = [
  {
    invoiceNo: "INV-2026-001",
    invoiceDate: "2026-09-02",
    supplierGstin: "27AABCB1234A1Z5",
    supplierName: "Apex Steel Ltd",
    taxableValue: 500000,
    igst: 90000,
    cgst: 0,
    sgst: 0,
    totalTax: 90000,
    filingDateGstr1: "2026-10-11",
    itcAvailable: true,
  },
  {
    invoiceNo: "INV-2026-002",
    invoiceDate: "2026-09-05",
    supplierGstin: "29BBBCB5678B1Z2",
    supplierName: "Bharat Fasteners",
    taxableValue: 200000,
    igst: 0,
    cgst: 18000,
    sgst: 18000,
    totalTax: 36000,
    filingDateGstr1: "2026-10-10",
    itcAvailable: true,
  },
  {
    invoiceNo: "INV-2026-004",
    invoiceDate: "2026-09-18",
    supplierGstin: "27EEDCB3456D1Z1",
    supplierName: "Luxury Car Fleet Co",
    taxableValue: 800000,
    igst: 144000,
    cgst: 0,
    sgst: 0,
    totalTax: 144000,
    filingDateGstr1: "2026-10-11",
    itcAvailable: false, // Blocked in 2B
  },
  {
    invoiceNo: "INV-2026-005",
    invoiceDate: "2026-09-22",
    supplierGstin: "27FFFCB7890E1Z4",
    supplierName: "Delta Logistics",
    taxableValue: 50000,
    igst: 8500, // Discrepancy
    cgst: 0,
    sgst: 0,
    totalTax: 8500,
    filingDateGstr1: "2026-10-11",
    itcAvailable: true,
  },
  {
    invoiceNo: "INV-2026-099",
    invoiceDate: "2026-09-28",
    supplierGstin: "27GGGCB1122F1Z9",
    supplierName: "Om Paper Mills",
    taxableValue: 75000,
    igst: 13500,
    cgst: 0,
    sgst: 0,
    totalTax: 13500,
    filingDateGstr1: "2026-10-10",
    itcAvailable: true,
  },
];

export function ItcReconciliationView() {
  const [filter, setFilter] = useState<"ALL" | ItcMatchStatus>("ALL");

  const result = useMemo(() => {
    return reconcileItc(SAMPLE_PURCHASE_REGISTER, SAMPLE_GSTR2B);
  }, []);

  const filteredItems = useMemo(() => {
    if (filter === "ALL") return result.items;
    return result.items.filter((item) => item.status === filter);
  }, [result, filter]);

  const handleDownloadCsv = () => {
    const csv = generateItcReconciliationCsv(result);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ITC_Reconciliation_Rule37A_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { summary } = result;

  return (
    <div className="space-y-6">
      {/* Statutory Header */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">GST Statutory Audit</span>
              <span className="rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Section 16(2)(aa) & Rule 37A</span>
            </div>
            <h3 className="mt-1 font-semibold text-foreground text-base sm:text-lg">
              GSTR-2B Auto-Reconciliation & Input Tax Credit Defense
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
              Strict statutory matching against auto-drafted GSTR-2B data. Detects vendor missing invoices, tax discrepancies, unclaimed credits, and Section 17(5) blocked liabilities.
            </p>
          </div>
          <button
            onClick={handleDownloadCsv}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95 transition-opacity"
          >
            Export Rule 37A Audit CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Eligible ITC (Claimable)</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-success tabular-nums">{inr(summary.eligibleItcGstr3B)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Table 4(A)(5) safe to claim</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">At Risk ITC</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-danger tabular-nums">{inr(summary.atRiskItc)}</div>
          <div className="mt-0.5 text-[11px] text-danger">Missing in 2B or mismatch</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Unclaimed ITC (in Books)</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-foreground tabular-nums">{inr(summary.unclaimedItc)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">In 2B, not entered in books</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Blocked ITC (Sec 17(5))</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-muted-foreground tabular-nums">{inr(summary.blockedItc17_5)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Statutorily blocked</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Total Book ITC</div>
          <div className="mt-1 text-lg sm:text-xl font-bold text-foreground tabular-nums">{inr(summary.totalBookItc)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Purchase register total</div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        {(
          [
            { id: "ALL" as const, label: `All Invoices (${result.items.length})` },
            { id: "matched" as const, label: `Matched (${summary.matchedCount})` },
            { id: "missing_in_2b" as const, label: `Missing in 2B (${summary.missingIn2BCount})` },
            { id: "blocked_section_17_5" as const, label: `Sec 17(5) Blocked (${summary.blockedCount})` },
            { id: "tax_mismatch" as const, label: `Tax Mismatch (${summary.mismatchCount})` },
            { id: "missing_in_books" as const, label: `In 2B Only (${summary.missingInBooksCount})` },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.id
                ? "bg-foreground text-background"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Reconciliation Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground border-b font-medium">
              <tr>
                <th className="px-3.5 py-2.5">Invoice #</th>
                <th className="px-3.5 py-2.5">Supplier & GSTIN</th>
                <th className="px-3.5 py-2.5 text-right">Taxable (Books)</th>
                <th className="px-3.5 py-2.5 text-right">Taxable (2B)</th>
                <th className="px-3.5 py-2.5 text-right">Tax (Books)</th>
                <th className="px-3.5 py-2.5 text-right">Tax (2B)</th>
                <th className="px-3.5 py-2.5">Audit Status</th>
                <th className="px-3.5 py-2.5">Statutory Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item, idx) => (
                <tr key={`${item.invoiceNo}-${idx}`} className="hover:bg-muted/20">
                  <td className="px-3.5 py-2.5 font-semibold text-foreground whitespace-nowrap">
                    {item.invoiceNo}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <div className="font-medium text-foreground">
                      {item.supplierName || "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {item.supplierGstin}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">
                    {item.bookTaxable > 0 ? inr(item.bookTaxable) : "—"}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">
                    {item.portalTaxable > 0 ? inr(item.portalTaxable) : "—"}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">
                    {item.bookTax > 0 ? inr(item.bookTax) : "—"}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums font-medium">
                    {item.portalTax > 0 ? inr(item.portalTax) : "—"}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    {item.status === "matched" && (
                      <span className="rounded bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                        ✓ MATCHED (Sec 16)
                      </span>
                    )}
                    {item.status === "missing_in_2b" && (
                      <span className="rounded bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
                        ✗ MISSING IN 2B
                      </span>
                    )}
                    {item.status === "blocked_section_17_5" && (
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        ⊘ BLOCKED 17(5)
                      </span>
                    )}
                    {item.status === "tax_mismatch" && (
                      <span className="rounded bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                        ≠ TAX MISMATCH
                      </span>
                    )}
                    {item.status === "missing_in_books" && (
                      <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        + IN 2B ONLY
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-[11px] text-muted-foreground max-w-xs">
                    {item.recommendedAction}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Statutory Guidance */}
      <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">Statutory GST Notes for Registered Enterprises:</div>
        <div>1. <strong>Section 16(2)(aa):</strong> ITC can only be claimed if invoice details have been furnished by the supplier in GSTR-1/IFF and communicated to the recipient in Form GSTR-2B.</div>
        <div>2. <strong>Rule 37A Reversal:</strong> If your supplier files GSTR-1 but defaults on filing GSTR-3B by 30th September following the financial year end, the recipient must reverse the ITC along with applicable interest under Section 50 by 30th November.</div>
        <div>3. <strong>Section 17(5) Ineligible Credits:</strong> Motor vehicles (&le; 13 seats), food/beverages, club memberships, and personal consumption items must not be credited to Electronic Credit Ledger.</div>
      </div>
    </div>
  );
}
