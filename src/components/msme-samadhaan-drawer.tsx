"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  calculateMsefcClaim,
  generateFormalLegalDemandNotice,
  generateMsefcPetitionSummary,
  STATUTORY_PENAL_RATE_PCT,
  type OverdueClaimInvoice,
} from "@/lib/msme-samadhaan";
import { inr } from "@/lib/utils";
import { Copy, Check, FileText, Scale, ExternalLink, AlertTriangle } from "lucide-react";

interface MsmeSamadhaanDrawerProps {
  defaultClaimantName?: string;
  defaultDebtorName?: string;
  invoices?: OverdueClaimInvoice[];
}

export function MsmeSamadhaanDrawer({
  defaultClaimantName = "Your Enterprise",
  defaultDebtorName = "Defaulting Corporate Buyer",
  invoices = [],
}: MsmeSamadhaanDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [activeTab, setActiveTab] = useState<"notice" | "portal">("notice");

  // Form states
  const [claimantName, setClaimantName] = useState(defaultClaimantName);
  const [udyamRegNo, setUdyamRegNo] = useState("UDYAM-MH-03-0012345");
  const [category, setCategory] = useState<"micro" | "small">("small");
  const [claimantAddress, setClaimantAddress] = useState("Principal Place of Business, India");
  const [respondentName, setRespondentName] = useState(defaultDebtorName);
  const [respondentGstin, setRespondentGstin] = useState("");
  const [respondentAddress, setRespondentAddress] = useState("Registered Corporate Office, India");

  // Sample invoices if none provided
  const activeInvoices: OverdueClaimInvoice[] = useMemo(() => {
    if (invoices.length > 0) return invoices;
    return [
      {
        invoiceNo: "INV-2026-101",
        invoiceDate: new Date(Date.now() - 95 * 86400000).toISOString().slice(0, 10),
        amount: 350000,
        hasWrittenAgreement: true,
      },
      {
        invoiceNo: "INV-2026-108",
        invoiceDate: new Date(Date.now() - 72 * 86400000).toISOString().slice(0, 10),
        amount: 220000,
        hasWrittenAgreement: false,
      },
      {
        invoiceNo: "INV-2026-114",
        invoiceDate: new Date(Date.now() - 55 * 86400000).toISOString().slice(0, 10),
        amount: 180000,
        hasWrittenAgreement: true,
      },
    ];
  }, [invoices]);

  const claimSummary = useMemo(() => {
    return calculateMsefcClaim(activeInvoices);
  }, [activeInvoices]);

  const legalNoticeText = useMemo(() => {
    return generateFormalLegalDemandNotice({
      claimant: {
        name: claimantName || "Your Enterprise",
        udyamRegNo: udyamRegNo || "UDYAM-REG-PENDING",
        category,
        address: claimantAddress,
      },
      respondent: {
        name: respondentName || "Defaulting Debtor",
        address: respondentAddress,
        gstinOrCin: respondentGstin,
      },
      invoices: activeInvoices,
    });
  }, [claimantName, udyamRegNo, category, claimantAddress, respondentName, respondentAddress, respondentGstin, activeInvoices]);

  const petitionDraftText = useMemo(() => {
    return generateMsefcPetitionSummary({
      claimant: {
        name: claimantName || "Your Enterprise",
        udyamRegNo: udyamRegNo || "UDYAM-REG-PENDING",
        category,
        address: claimantAddress,
      },
      respondent: {
        name: respondentName || "Defaulting Debtor",
        address: respondentAddress,
        gstinOrCin: respondentGstin,
      },
      invoices: activeInvoices,
    });
  }, [claimantName, udyamRegNo, category, claimantAddress, respondentName, respondentAddress, respondentGstin, activeInvoices]);

  const copyNotice = () => {
    navigator.clipboard.writeText(legalNoticeText);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2000);
  };

  const copyPortal = () => {
    navigator.clipboard.writeText(petitionDraftText);
    setCopiedPortal(true);
    setTimeout(() => setCopiedPortal(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Trigger Card / Banner */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
              <Scale className="h-3.5 w-3.5" /> MSMED Act Section 18
            </span>
            <span className="text-xs text-muted-foreground">Statutory MSME Samadhaan Protection</span>
          </div>
          <h4 className="mt-1 text-base font-semibold text-foreground">
            Recover Overdue Dues via MSME Facilitation Council (MSEFC)
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground max-w-2xl">
            Generate an ironclad legal demand notice citing Supreme Court precedents and {STATUTORY_PENAL_RATE_PCT}% compound penal interest (3x RBI Bank Rate). If unpaid after 15 days, file directly on MSME Samadhaan where buyers must deposit 75% to appeal.
          </p>
        </div>
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="whitespace-nowrap"
          size="sm"
        >
          {isOpen ? "Close Legal Drafter" : "Draft Legal Notice & Petition"}
        </Button>
      </div>

      {/* Expanded Drafter Drawer */}
      {isOpen && (
        <Card className="p-4 sm:p-6 space-y-6 border-primary/20">
          {/* Header Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 bg-card">
              <div className="text-xs text-muted-foreground">Total Overdue Principal</div>
              <div className="text-lg font-bold text-foreground tabular-nums">
                {inr(claimSummary.totalPrincipal)}
              </div>
              <div className="text-[11px] text-muted-foreground">{activeInvoices.length} invoices overdue</div>
            </div>
            <div className="rounded-lg border p-3 bg-card">
              <div className="text-xs text-muted-foreground">Section 16 Penal Interest</div>
              <div className="text-lg font-bold text-danger tabular-nums">
                {inr(claimSummary.totalPenalInterest)}
              </div>
              <div className="text-[11px] text-danger">{claimSummary.applicableAnnualRatePct}% p.a. monthly compound</div>
            </div>
            <div className="rounded-lg border border-primary/40 p-3 bg-primary/5">
              <div className="text-xs text-primary font-medium">Total Demandable Claim</div>
              <div className="text-lg font-bold text-primary tabular-nums">
                {inr(claimSummary.totalClaimAmount)}
              </div>
              <div className="text-[11px] text-muted-foreground">Principal + Statutory Penal Int.</div>
            </div>
            <div className="rounded-lg border p-3 bg-card">
              <div className="text-xs text-muted-foreground">Max Payment Delay</div>
              <div className="text-lg font-bold text-warning tabular-nums">
                {claimSummary.oldestOverdueDays} Days
              </div>
              <div className="text-[11px] text-warning">Past statutory window</div>
            </div>
          </div>

          {/* Configuration Inputs */}
          <div className="grid sm:grid-cols-2 gap-4 border-y py-4">
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Claimant Details (Supplier / Creditor)
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Your Enterprise Name</label>
                <input
                  type="text"
                  value={claimantName}
                  onChange={(e) => setClaimantName(e.target.value)}
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Udyam Registration #</label>
                  <input
                    type="text"
                    value={udyamRegNo}
                    onChange={(e) => setUdyamRegNo(e.target.value)}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Udyam Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="micro">Micro Enterprise (&lt; ₹1 Cr / ₹5 Cr)</option>
                    <option value="small">Small Enterprise (&lt; ₹10 Cr / ₹50 Cr)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Registered Address</label>
                <input
                  type="text"
                  value={claimantAddress}
                  onChange={(e) => setClaimantAddress(e.target.value)}
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Respondent Details (Defaulting Buyer / Debtor)
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Debtor Company / Entity Name</label>
                <input
                  type="text"
                  value={respondentName}
                  onChange={(e) => setRespondentName(e.target.value)}
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Debtor GSTIN / CIN (Optional)</label>
                <input
                  type="text"
                  value={respondentGstin}
                  onChange={(e) => setRespondentGstin(e.target.value)}
                  placeholder="e.g. 27AAACR1234A1Z5"
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Debtor Office Address</label>
                <input
                  type="text"
                  value={respondentAddress}
                  onChange={(e) => setRespondentAddress(e.target.value)}
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Switchable View Tabs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("notice")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    activeTab === "notice"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <FileText className="inline-block h-3.5 w-3.5 mr-1" />
                  15-Day Statutory Legal Demand Notice
                </button>
                <button
                  onClick={() => setActiveTab("portal")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    activeTab === "portal"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <Scale className="inline-block h-3.5 w-3.5 mr-1" />
                  MSME Samadhaan (MSEFC) Petition Draft
                </button>
              </div>

              {activeTab === "notice" ? (
                <Button size="sm" variant="outline" onClick={copyNotice} className="text-xs h-8">
                  {copiedNotice ? <Check className="h-3.5 w-3.5 text-success mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copiedNotice ? "Copied Legal Notice!" : "Copy Legal Notice"}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={copyPortal} className="text-xs h-8">
                    {copiedPortal ? <Check className="h-3.5 w-3.5 text-success mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copiedPortal ? "Copied Draft!" : "Copy Petition Text"}
                  </Button>
                  <a
                    href="https://samadhaan.msme.gov.in"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                  >
                    Open MSME Samadhaan Portal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Document Preview Box */}
            <div className="rounded-lg border bg-muted/40 p-4 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed select-all">
              {activeTab === "notice" ? legalNoticeText : petitionDraftText}
            </div>
          </div>

          {/* Statutory Shield Notice */}
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3.5 text-xs space-y-1.5 text-muted-foreground">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Statutory Shields Provided Under Chapter V of the MSMED Act, 2006:
            </div>
            <div>
              &bull; <strong>Section 19 Pre-Deposit:</strong> In the event the Council passes an award in your favor, the buyer <em>cannot</em> appeal in any court without pre-depositing 75% of the decree amount in cash.
            </div>
            <div>
              &bull; <strong>Section 23 Tax Disallowance:</strong> The Section 16 penal interest cannot be deducted as a business expense by the buyer. Under Section 43B(h), overdue principal is added back to their taxable profits.
            </div>
            <div>
              &bull; <strong>Section 24 Overriding Effect:</strong> The provisions of the MSMED Act override all other laws, including private arbitration agreements or general sales terms.
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
