"use client";

import React, { useState, useEffect } from "react";
import Script from "next/script";
import {
  Mail,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Receipt,
  QrCode,
  Sparkles,
  RefreshCw,
  Copy,
  CheckCircle2,
  Database,
  ExternalLink,
  CreditCard,
  Send,
  FileCheck2,
  FileWarning,
} from "lucide-react";

export default function OutlookTaskpanePage() {
  const [isOfficeReady, setIsOfficeReady] = useState(false);
  const [isInsideOutlook, setIsInsideOutlook] = useState(false);
  const [senderEmail, setSenderEmail] = useState<string>("accounts@nexusretail.com");
  const [emailSubject, setEmailSubject] = useState<string>("Payment update for pending invoices");
  const [emailBodySnippet, setEmailBodySnippet] = useState<string>("");
  const [partyData, setPartyData] = useState<any>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [savingKnowledge, setSavingKnowledge] = useState(false);

  // Initialize Office.js
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).Office) {
      (window as any).Office.onReady((info: any) => {
        setIsOfficeReady(true);
        if (info.host === (window as any).Office?.HostType?.Outlook) {
          setIsInsideOutlook(true);
          const item = (window as any).Office.context.mailbox?.item;
          if (item) {
            // Read mode sender
            if (item.from?.emailAddress) {
              setSenderEmail(item.from.emailAddress);
            }
            if (item.subject) {
              setEmailSubject(item.subject);
            }
            // Read body snippet
            if (item.body?.getAsync) {
              item.body.getAsync((window as any).Office.CoercionType.Text, (result: any) => {
                if (result.status === (window as any).Office.AsyncResultStatus.Succeeded) {
                  setEmailBodySnippet(result.value || "");
                }
              });
            }
          }
        }
      });
    }
  }, []);

  // Fetch party details for current email
  const fetchPartyContext = async (emailToFetch: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/office/context?email=${encodeURIComponent(emailToFetch)}`);
      const data = await res.json();
      if (data.ok && data.outlookData) {
        setPartyData(data.outlookData.matchedParty);
        setPaymentDetails(data.outlookData.paymentDetails);
      }
    } catch (e) {
      console.error("Outlook context fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartyContext(senderEmail);
  }, [senderEmail]);

  // Insert payment request with UPI link into email body
  const handleInsertPaymentRequest = async () => {
    if (!partyData || !paymentDetails) return;
    setActionStatus("Inserting payment request into message draft...");

    const upiLink = `upi://pay?pa=${encodeURIComponent(paymentDetails.upiId)}&pn=${encodeURIComponent(paymentDetails.beneficiary)}&am=${partyData.totalOutstanding}&cu=INR`;

    const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #1e293b;">
  <p>Dear ${partyData.name} Accounts Team,</p>
  <p>According to our books on <strong>MNB Cortex</strong>, the current outstanding balance on your account is <strong>₹${partyData.totalOutstanding.toLocaleString("en-IN")}</strong> across the following open invoice(s):</p>
  
  <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px;">
    <thead>
      <tr style="background-color: #0f172a; color: #ffffff; text-align: left;">
        <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Invoice #</th>
        <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Invoice Date</th>
        <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Due Date</th>
        <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${partyData.invoices
        .map(
          (inv: any) => `
      <tr>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600;">${inv.invoiceNo}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${inv.date}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${inv.dueDate}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-weight: 600;">₹${inv.amount.toLocaleString("en-IN")}</td>
      </tr>`
        )
        .join("")}
      <tr style="background-color: #f8fafc; font-weight: bold;">
        <td colspan="3" style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Total Amount Due:</td>
        <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right; color: #047857;">₹${partyData.totalOutstanding.toLocaleString("en-IN")}</td>
      </tr>
    </tbody>
  </table>

  <div style="background-color: #f1f5f9; padding: 12px; border-radius: 6px; margin: 12px 0; border: 1px solid #e2e8f0;">
    <strong style="color: #0f172a;">Bank Transfer &amp; UPI Settlement Details:</strong><br/>
    <strong>Beneficiary:</strong> ${paymentDetails.beneficiary}<br/>
    <strong>Bank:</strong> ${paymentDetails.bankName}<br/>
    <strong>A/C No:</strong> ${paymentDetails.accountNumber}<br/>
    <strong>IFSC:</strong> ${paymentDetails.ifsc}<br/>
    <strong>UPI VPA:</strong> <a href="${upiLink}" style="color: #059669; font-weight: 600;">${paymentDetails.upiId}</a><br/>
    <p style="margin: 6px 0 0 0; font-size: 11px; color: #64748b;">Click the UPI link or scan directly using any banking / BHIM UPI app.</p>
  </div>

  <p>Kindly confirm once remittance is initiated so we may issue the official receipt and reconcile your ledger immediately.</p>
  <p>Warm regards,<br/>Finance &amp; Accounts</p>
</div>
`;

    try {
      if (typeof window !== "undefined" && (window as any).Office?.context?.mailbox?.item?.body?.setSelectedDataAsync && isInsideOutlook) {
        (window as any).Office.context.mailbox.item.body.setSelectedDataAsync(
          htmlBody,
          { coercionType: (window as any).Office.CoercionType.Html },
          (asyncResult: any) => {
            if (asyncResult.status === (window as any).Office.AsyncResultStatus.Succeeded) {
              setActionStatus("✅ Payment request inserted into email body.");
            } else {
              setActionStatus(`Failed to insert: ${asyncResult.error?.message}`);
            }
          }
        );
      } else {
        // Browser Simulator copy fallback
        navigator.clipboard?.writeText(htmlBody);
        setActionStatus("✅ Simulated: Payment breakdown generated & copied to clipboard.");
      }
    } catch (e: any) {
      console.error(e);
      setActionStatus(`Error: ${e?.message}`);
    }
  };

  // Insert Section 43B(h) Statutory Notice
  const handleInsertStatutoryNotice = async () => {
    if (!partyData) return;
    setActionStatus("Inserting Section 43B(h) statutory notice...");

    const htmlNotice = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #1e293b;">
  <p><strong>SUBJECT: STATUTORY NOTICE REGARDING SECTION 43B(h) OF THE INCOME TAX ACT, 1961</strong></p>
  <p>Dear Accounts Team,</p>
  <p>This is a formal advisory regarding our registered enterprise status under the <strong>Micro, Small and Medium Enterprises Development (MSMED) Act, 2006</strong>.</p>
  <p>Pursuant to <strong>Section 43B(h) of the Income Tax Act, 1961</strong> (effective FY 2023-24 onwards), any sum payable to a registered Micro or Small enterprise beyond the statutory payment window (maximum 45 days where agreed in writing, or 15 days in absence of agreement) is <strong>disallowed as an allowable business deduction</strong> in the financial year of expense accrual.</p>
  <p>Our records reflect an outstanding balance of <strong>₹${partyData.totalOutstanding.toLocaleString("en-IN")}</strong> with an overdue duration of <strong>${partyData.oldestOverdueDays} days</strong>.</p>
  <p>To ensure statutory compliance and prevent tax disallowances along with compounding interest under Section 16 of the MSMED Act, we request you to arrange clearance of these dues immediately.</p>
  <p>Thank you for your prompt attention to this statutory requirement.</p>
</div>
`;

    try {
      if (typeof window !== "undefined" && (window as any).Office?.context?.mailbox?.item?.body?.setSelectedDataAsync && isInsideOutlook) {
        (window as any).Office.context.mailbox.item.body.setSelectedDataAsync(
          htmlNotice,
          { coercionType: (window as any).Office.CoercionType.Html },
          (res: any) => {
            if (res.status === (window as any).Office.AsyncResultStatus.Succeeded) {
              setActionStatus("✅ 43B(h) statutory notice inserted.");
            } else {
              setActionStatus(`Failed to insert: ${res.error?.message}`);
            }
          }
        );
      } else {
        navigator.clipboard?.writeText(htmlNotice);
        setActionStatus("✅ Simulated: 43B(h) Notice generated & copied to clipboard.");
      }
    } catch (e: any) {
      setActionStatus(`Error: ${e?.message}`);
    }
  };

  // Save email promise to Company Knowledge
  const handleSaveToKnowledge = async () => {
    setSavingKnowledge(true);
    setActionStatus(null);
    try {
      const res = await fetch("/api/office/save-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: senderEmail,
          sender: partyData?.name || senderEmail,
          subject: emailSubject,
          content: emailBodySnippet || "Customer confirmed payment schedule and requested invoice statement.",
          type: "promise_to_pay",
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setActionStatus("✅ Synced to Company Knowledge! Cortex agents will reference this in future collections sweeps.");
      } else {
        setActionStatus(`Failed: ${json.error}`);
      }
    } catch (e: any) {
      setActionStatus(`Error: ${e?.message}`);
    } finally {
      setSavingKnowledge(false);
    }
  };

  return (
    <>
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (typeof window !== "undefined" && (window as any).Office) {
            (window as any).Office.onReady((info: any) => {
              setIsOfficeReady(true);
              if (info.host === (window as any).Office?.HostType?.Outlook) {
                setIsInsideOutlook(true);
              }
            });
          }
        }}
      />

      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
        {/* Header */}
        <header className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between sticky top-0 z-20 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs tracking-wider">
              C
            </div>
            <div>
              <div className="text-xs font-semibold tracking-tight text-white flex items-center gap-1.5">
                MNB Cortex
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  Outlook
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">Ledger Context</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isInsideOutlook ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
              title={isInsideOutlook ? "Connected to Outlook" : "Simulator Mode"}
            />
            <span className="text-[10px] text-slate-400 font-medium">
              {isInsideOutlook ? "Outlook Live" : "Simulator"}
            </span>
          </div>
        </header>

        {/* Sender Lookup Bar */}
        <div className="p-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
          <input
            type="email"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder="Sender / Recipient Email"
            className="flex-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => fetchPartyContext(senderEmail)}
            disabled={loading}
            aria-label="Refresh Party Intelligence"
            className="h-9 w-9 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
            title="Refresh Party Intelligence"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Content Body */}
        <main className="flex-1 p-3 overflow-y-auto space-y-3.5 text-xs">
          {partyData ? (
            <>
              {/* Customer / Vendor Summary Card */}
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/80 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                      {partyData.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">{partyData.email}</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                    {partyData.category}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 text-center font-mono">
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[9px]">Total Outstanding</div>
                    <div className="text-emerald-400 font-bold text-xs">
                      ₹{partyData.totalOutstanding.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[9px]">Oldest Overdue</div>
                    <div className={`font-bold text-xs ${partyData.oldestOverdueDays > 45 ? "text-red-400" : "text-amber-400"}`}>
                      {partyData.oldestOverdueDays} Days
                    </div>
                  </div>
                </div>

                {/* MSME 43B(h) Badge */}
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <div className="text-[10px] text-amber-200">
                    <span className="font-semibold">{partyData.udyamCategory}: </span>
                    <span>{partyData.msmeStatus}</span>
                  </div>
                </div>
              </div>

              {/* Open Invoices Table */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-slate-400" />
                    Open Invoices ({partyData.invoices?.length || 0})
                  </span>
                </div>

                <div className="space-y-1.5">
                  {partyData.invoices?.map((inv: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-2 rounded border border-slate-800 bg-slate-900/60 flex items-center justify-between font-mono text-[10px]"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{inv.invoiceNo}</div>
                        <div className="text-slate-400 text-[9px]">Due: {inv.dueDate} ({inv.daysOverdue}d overdue)</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white">₹{inv.amount.toLocaleString("en-IN")}</div>
                        <span className={`text-[8px] px-1 py-0.2 rounded font-sans ${inv.status.includes("CRITICAL") ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 1-Click Smart Actions */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-semibold text-slate-300">1-Click Verified Actions:</span>

                <button
                  onClick={handleInsertPaymentRequest}
                  className="w-full p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Insert Payment Breakdown &amp; UPI QR
                </button>

                <button
                  onClick={handleInsertStatutoryNotice}
                  className="w-full p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <FileWarning className="h-3.5 w-3.5 text-amber-400" />
                  Insert Section 43B(h) Legal Notice
                </button>

                <button
                  onClick={handleSaveToKnowledge}
                  disabled={savingKnowledge}
                  className="w-full p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] flex items-center justify-center gap-2 transition-colors"
                >
                  <Database className={`h-3 w-3 text-emerald-400 ${savingKnowledge ? "animate-spin" : ""}`} />
                  {savingKnowledge ? "Syncing..." : "Save Email to Company Knowledge"}
                </button>
              </div>

              {actionStatus && (
                <div className="p-2.5 rounded bg-slate-900 border border-slate-700 text-[11px] text-emerald-400 font-mono">
                  {actionStatus}
                </div>
              )}
            </>
          ) : (
            <div className="p-6 text-center text-slate-400 space-y-2">
              <Mail className="h-8 w-8 mx-auto text-slate-600" />
              <div>No ledger matches for this email address.</div>
              <div className="text-[10px] text-slate-500">
                Enter a registered customer or vendor email above to fetch their outstanding invoices and 43B(h) status.
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="p-2.5 border-t border-slate-800/80 bg-slate-900/80 text-[10px] text-slate-400 flex items-center justify-between">
          <span>MNB Cortex Outlook Add-in</span>
          <a
            href="https://cortex.mnbresearch.com/integrations/office"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline flex items-center gap-1"
          >
            Office Hub <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </footer>
      </div>
    </>
  );
}
