/**
 * MSME Samadhaan (MSEFC) Statutory Recovery Petition & Legal Demand Notice Engine.
 *
 * Statutory Framework:
 * Micro, Small and Medium Enterprises Development Act, 2006 (MSMED Act):
 * - Section 15: Statutory payment timeline (max 45 days with agreement, 15 days without).
 * - Section 16: Compound interest with monthly rests at 3x RBI Bank Rate (20.25% p.a.).
 * - Section 17: Buyer's statutory liability for principal + penal interest.
 * - Section 18: Reference to Micro and Small Enterprises Facilitation Council (MSEFC).
 * - Section 19: Mandatory 75% pre-deposit of awarded amount for any buyer appeal.
 * - Section 23: Section 16 penal interest disallowed as tax deduction.
 * - Section 24: Overriding effect over Indian Contract Act and Arbitration Act.
 *
 * DELIBERATELY PURE — safely executed on client, server, or standalone test runners.
 */

export interface OverdueClaimInvoice {
  invoiceNo: string;
  invoiceDate: string; // ISO YYYY-MM-DD
  dueDate?: string;    // ISO YYYY-MM-DD
  amount: number;
  hasWrittenAgreement?: boolean; // If true: 45 days; if false: 15 days
  goodsOrServicesDesc?: string;
}

export interface LegalNoticeParams {
  claimant: {
    name: string;
    udyamRegNo: string;
    category: "micro" | "small";
    address: string;
    email?: string;
    phone?: string;
  };
  respondent: {
    name: string;
    address: string;
    gstinOrCin?: string;
    email?: string;
  };
  invoices: OverdueClaimInvoice[];
  noticeDate?: string; // ISO YYYY-MM-DD
  rbiBankRatePct?: number; // Default 6.75%
}

export interface InvoiceInterestBreakdown {
  invoiceNo: string;
  invoiceDate: string;
  statutoryDueDate: string;
  daysDelayed: number;
  principal: number;
  penalInterest: number;
  totalDue: number;
}

export interface MsefcClaimSummary {
  claimantName: string;
  respondentName: string;
  totalPrincipal: number;
  totalPenalInterest: number;
  totalClaimAmount: number;
  applicableAnnualRatePct: number;
  oldestOverdueDays: number;
  invoices: InvoiceInterestBreakdown[];
}

export const CURRENT_RBI_BANK_RATE_PCT = 6.75;
export const MSME_SECTION_16_MULTIPLIER = 3;
export const STATUTORY_PENAL_RATE_PCT = CURRENT_RBI_BANK_RATE_PCT * MSME_SECTION_16_MULTIPLIER; // 20.25%

/**
 * Computes compound interest with monthly rests under Section 16 of MSMED Act.
 * Formula: A = P * (1 + r/12)^(months) + fractional month simple interest.
 */
export function calculateSection16CompoundInterest(
  principal: number,
  daysDelayed: number,
  annualRatePct: number = STATUTORY_PENAL_RATE_PCT
): number {
  if (principal <= 0 || daysDelayed <= 0) return 0;

  const monthlyRate = annualRatePct / 100 / 12;
  const fullMonths = Math.floor(daysDelayed / 30);
  const remainingDays = daysDelayed % 30;

  // Monthly compound interest on full months
  const compoundedPrincipal = principal * Math.pow(1 + monthlyRate, fullMonths);

  // Pro-rata simple interest on remaining days
  const fractionalInterest = compoundedPrincipal * (monthlyRate * (remainingDays / 30));

  const totalAmount = compoundedPrincipal + fractionalInterest;
  const interest = totalAmount - principal;

  return Math.round(interest * 100) / 100;
}

/**
 * Calculates statutory due date and overdue breakdown for a set of invoices.
 */
export function calculateMsefcClaim(
  invoices: OverdueClaimInvoice[],
  referenceDate: Date = new Date(),
  bankRatePct: number = CURRENT_RBI_BANK_RATE_PCT
): MsefcClaimSummary {
  const annualRate = bankRatePct * MSME_SECTION_16_MULTIPLIER;
  const refTime = referenceDate.getTime();

  let totalPrincipal = 0;
  let totalPenalInterest = 0;
  let maxDelay = 0;

  const items: InvoiceInterestBreakdown[] = invoices.map((inv) => {
    const invDate = new Date(inv.invoiceDate);
    const windowDays = inv.hasWrittenAgreement ? 45 : 15;

    // Statutory due date cannot exceed 45 days from invoice/acceptance
    const statutoryDue = new Date(invDate.getTime() + windowDays * 86400000);
    const daysDelayed = Math.max(0, Math.floor((refTime - statutoryDue.getTime()) / 86400000));

    if (daysDelayed > maxDelay) {
      maxDelay = daysDelayed;
    }

    const principal = Math.round(inv.amount * 100) / 100;
    const interest = calculateSection16CompoundInterest(principal, daysDelayed, annualRate);
    const totalDue = Math.round((principal + interest) * 100) / 100;

    totalPrincipal += principal;
    totalPenalInterest += interest;

    return {
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      statutoryDueDate: statutoryDue.toISOString().slice(0, 10),
      daysDelayed,
      principal,
      penalInterest: interest,
      totalDue,
    };
  });

  return {
    claimantName: "",
    respondentName: "",
    totalPrincipal: Math.round(totalPrincipal * 100) / 100,
    totalPenalInterest: Math.round(totalPenalInterest * 100) / 100,
    totalClaimAmount: Math.round((totalPrincipal + totalPenalInterest) * 100) / 100,
    applicableAnnualRatePct: annualRate,
    oldestOverdueDays: maxDelay,
    invoices: items,
  };
}

/**
 * Generates an ironclad formal legal demand notice citing Sections 15–24 of the MSMED Act, 2006.
 */
export function generateFormalLegalDemandNotice(params: LegalNoticeParams): string {
  const noticeDate = params.noticeDate || new Date().toISOString().slice(0, 10);
  const claim = calculateMsefcClaim(params.invoices, new Date(noticeDate), params.rbiBankRatePct);

  const invoiceTable = claim.invoices
    .map(
      (inv, idx) =>
        `  ${idx + 1}. Inv #${inv.invoiceNo} | Date: ${inv.invoiceDate} | Due: ${inv.statutoryDueDate} | Delayed: ${inv.daysDelayed} days\n` +
        `     Principal: ₹${inv.principal.toLocaleString("en-IN")} | Sec 16 Interest: ₹${inv.penalInterest.toLocaleString("en-IN")} | Total: ₹${inv.totalDue.toLocaleString("en-IN")}`
    )
    .join("\n\n");

  return `FORMAL STATUTORY LEGAL DEMAND NOTICE
UNDER SECTIONS 15, 16, 17, 18 & 24 OF THE MICRO, SMALL AND MEDIUM ENTERPRISES DEVELOPMENT ACT, 2006 (MSMED ACT)
DELIVERED VIA SPEED POST WITH A.D. & ELECTRONIC MAIL

Date: ${noticeDate}

TO:
The Board of Directors / Authorized Representative
${params.respondent.name}
${params.respondent.address || "Registered Corporate Office"}
${params.respondent.gstinOrCin ? `GSTIN / CIN: ${params.respondent.gstinOrCin}` : ""}
${params.respondent.email ? `Email: ${params.respondent.email}` : ""}

FROM:
${params.claimant.name}
Udyam Registration No: ${params.claimant.udyamRegNo} (Category: ${params.claimant.category.toUpperCase()} Enterprise)
${params.claimant.address || "Principal Place of Business"}
${params.claimant.email ? `Email: ${params.claimant.email}` : ""}
${params.claimant.phone ? `Phone: ${params.claimant.phone}` : ""}

SUBJECT:
DEMAND FOR IMMEDIATE LIQUIDATION OF OVERDUE PRINCIPAL OF ₹${claim.totalPrincipal.toLocaleString("en-IN")} ALONG WITH STATUTORY COMPOUND PENAL INTEREST OF ₹${claim.totalPenalInterest.toLocaleString("en-IN")} ACCRUED UNDER SECTION 16 OF MSMED ACT, 2006 (AGGREGATE AMOUNT: ₹${claim.totalClaimAmount.toLocaleString("en-IN")}) PRIOR TO INITIATION OF PETITION BEFORE THE MICRO AND SMALL ENTERPRISES FACILITATION COUNCIL (MSEFC).

Madam / Sir,

Under instructions and on behalf of our client, ${params.claimant.name}, a legally registered ${params.claimant.category.toUpperCase()} enterprise under the Micro, Small and Medium Enterprises Development Act, 2006 (Udyam: ${params.claimant.udyamRegNo}), we hereby serve upon you this formal statutory demand:

1. STATUTORY SUPPLIES & ACCEPTANCE:
   Our client supplied goods and/or rendered services to you against valid commercial invoices. The goods/services were duly received, inspected, and accepted by you without any objection or demur within the statutory acceptance window.

2. STATUTORY DELAY & DEFAULT UNDER SECTION 15:
   Under Section 15 of the MSMED Act, 2006, you were obligated to make payment within the mutually agreed timeline (which statutorily cannot exceed 45 days) or within 15 days in the absence of an agreement. Despite repeated follow-ups, you have failed to discharge your payment obligations, with delays extending up to ${claim.oldestOverdueDays} days past statutory limits.

3. STATUTORY COMPOUND PENAL INTEREST UNDER SECTION 16:
   Section 16 of the MSMED Act, 2006 expressly mandates:
   "Where any buyer fails to make payment of the amount to the supplier, the buyer shall, notwithstanding anything contained in any agreement between the buyer and the supplier or in any law for the time being in force, be liable to pay compound interest with monthly rests to the supplier on that amount from the appointed day or from the date immediately following the date agreed upon, at three times of the bank rate notified by the Reserve Bank."
   
   The notified RBI Bank Rate is ${params.rbiBankRatePct || CURRENT_RBI_BANK_RATE_PCT}% p.a. Consequently, the mandatory statutory interest rate is ${claim.applicableAnnualRatePct}% p.a., compounded monthly.

4. INVOICE-WISE CLAIM BREAKDOWN:
${invoiceTable}

   SUMMARY OF LIABILITY:
   - Total Outstanding Principal:  ₹${claim.totalPrincipal.toLocaleString("en-IN")}
   - Accrued Sec 16 Interest:      ₹${claim.totalPenalInterest.toLocaleString("en-IN")}
   - GRAND TOTAL DEMANDABLE:       ₹${claim.totalClaimAmount.toLocaleString("en-IN")}

5. SUPREME COURT JURISPRUDENCE & STATUTORY PROTECTIONS:
   Please take note of the following binding legal mandates established by the Hon'ble Supreme Court of India:
   a) Section 19 Mandatory 75% Pre-Deposit: In terms of Section 19 of the MSMED Act, no application or appeal against any decree or award of the Facilitation Council shall be entertained by any court unless you deposit seventy-five percent (75%) of the awarded amount in court (vide Silpi Industries v. KSRTC, 2021).
   b) Section 23 Disallowance of Tax Expense: Under Section 23 of the MSMED Act, read with Section 43B(h) of the Income-tax Act, 1961, compound interest paid or payable under Section 16 CANNOT be claimed as an expense or tax deduction.
   c) Section 24 Overriding Effect: The provisions of Sections 15 to 23 hold an overriding effect over any inconsistent clauses in commercial contracts or general law.

DEMAND & 15-DAY NOTICE PERIOD:
You are hereby formally called upon to liquidate the entire outstanding amount of ₹${claim.totalClaimAmount.toLocaleString("en-IN")} directly into our client's bank account within fifteen (15) days of receipt of this notice.

TAKE NOTICE that in the event of your failure or refusal to comply within the stipulated 15 days, our client shall, without further reference to you, file a formal reference under Section 18 of the MSMED Act before the Micro and Small Enterprises Facilitation Council (MSEFC) through the MSME Samadhaan Portal for recovery of the principal, continuously compounding penal interest until full realization, and litigation costs.

Yours faithfully,

For ${params.claimant.name}
Authorized Signatory / Legal Counsel`;
}

/**
 * Formats structured claim details for pasting directly into the MSME Samadhaan portal application form.
 */
export function generateMsefcPetitionSummary(params: LegalNoticeParams): string {
  const claim = calculateMsefcClaim(params.invoices, new Date(), params.rbiBankRatePct);

  return `=== MSME SAMADHAAN (MSEFC) PORTAL APPLICATION DRAFT ===
Udyam Registration: ${params.claimant.udyamRegNo}
Enterprise Category: ${params.claimant.category.toUpperCase()}
Petitioner Name: ${params.claimant.name}
Respondent Name: ${params.respondent.name}
Respondent GSTIN/CIN: ${params.respondent.gstinOrCin || "N/A"}

CLAIM SUMMARY:
- Principal Claim Amount: ₹${claim.totalPrincipal.toLocaleString("en-IN")}
- Statutory Compound Interest (Sec 16): ₹${claim.totalPenalInterest.toLocaleString("en-IN")}
- Total Claim Amount: ₹${claim.totalClaimAmount.toLocaleString("en-IN")}
- Statutory Interest Rate: ${claim.applicableAnnualRatePct}% p.a. (3x RBI Bank Rate, compounded monthly)

INVOICES LIST (${claim.invoices.length} Invoices):
${claim.invoices
  .map(
    (i) =>
      `• Invoice: ${i.invoiceNo} | Date: ${i.invoiceDate} | Due Date: ${i.statutoryDueDate} | Days Overdue: ${i.daysDelayed} | Principal: ₹${i.principal} | Sec 16 Interest: ₹${i.penalInterest}`
  )
  .join("\n")}

STATEMENT OF TRUTH:
The Petitioner confirms that goods/services described above were duly supplied and accepted without dispute. The Respondent has failed to liquidate the dues within the statutory period prescribed under Section 15 of the MSMED Act, 2006. Relief is prayed under Section 18 for full recovery of principal and compounding interest until actual realization.`;
}
