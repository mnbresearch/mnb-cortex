/**
 * Test suite for RBI TReDS Reverse Factoring & Working Capital Arbitrage Engine.
 */

import {
  calculateTredsArbitrage,
  DEFAULT_TREDS_RATE_PCT,
  DEFAULT_ALT_SME_BORROWING_RATE_PCT,
  RBI_AUTHORIZED_TREDS_EXCHANGES,
} from "../src/lib/treds-calculator.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing RBI TReDS Reverse Factoring Engine ===");

// 1. Regulatory Constants
check(DEFAULT_TREDS_RATE_PCT === 8.5, "Default TReDS bank auction bid rate is 8.5% p.a.");
check(DEFAULT_ALT_SME_BORROWING_RATE_PCT === 16.5, "Default alternative SME borrowing rate is 16.5% p.a.");
check(RBI_AUTHORIZED_TREDS_EXCHANGES.length >= 3, "At least 3 RBI authorized platforms registered");
check(RBI_AUTHORIZED_TREDS_EXCHANGES.some((e) => e.includes("RXIL")), "Includes RXIL (SIDBI/NSE)");
check(RBI_AUTHORIZED_TREDS_EXCHANGES.some((e) => e.includes("Invoicemart")), "Includes Invoicemart (Axis Bank)");
check(RBI_AUTHORIZED_TREDS_EXCHANGES.some((e) => e.includes("M1xchange")), "Includes M1xchange");

// 2. Factoring Math & Interest Arbitrage Verification
{
  // ₹10,00,000 invoice on 90-day terms
  const result = calculateTredsArbitrage({
    invoiceAmount: 1000000,
    paymentTermDays: 90,
    tredsDiscountRatePct: 8.5,
    alternativeBorrowingRatePct: 16.5,
    platformFeePct: 0.04,
  });

  // TReDS Discount Cost = 10,00,000 * 8.5% * 90 / 365 = 20,958.90
  check(Math.abs(result.tredsDiscountCost - 20958.9) < 1, `TReDS discount cost is ₹20,958.90 (got: ${result.tredsDiscountCost})`);

  // Platform fee = 10,00,000 * 0.04% = 400
  check(result.platformFeeAmount === 400, "Platform exchange fee is ₹400");

  // Immediate Cash Disbursed = 10,00,000 - 20,958.90 - 400 = 978,641.10
  check(Math.abs(result.immediateCashDisbursed - 978641.1) < 1, `Immediate cash disbursed is ₹9.78L (got: ${result.immediateCashDisbursed})`);

  // Alt Cost = 10,00,000 * 16.5% * 90 / 365 = 40,684.93
  check(Math.abs(result.alternativeFinancingCost - 40684.93) < 1, `Alternative SME borrowing cost is ₹40,684.93 (got: ${result.alternativeFinancingCost})`);

  // Net Savings = 40,684.93 - 21,358.90 = 19,326.03
  check(result.netInterestSaved > 19000, `Net interest saved exceeds ₹19,000 (got: ${result.netInterestSaved})`);

  // Turnaround & Recourse
  check(result.recourseType === "WITHOUT_RECOURSE", "TReDS factoring is 100% without recourse to MSME seller");
  check(result.turnaroundWindowHours === "48 to 72 Hours", "Cash release turnaround is 48 to 72 hours");
}

// 3. Edge Case: Zero Amount
{
  const zero = calculateTredsArbitrage({
    invoiceAmount: 0,
    paymentTermDays: 60,
  });

  check(zero.immediateCashDisbursed === 0, "Zero invoice produces zero disbursement");
  check(zero.netInterestSaved === 0, "Zero invoice produces zero savings");
}

console.log(`\ntreds: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ RBI TReDS Reverse Factoring Engine fully verified.");
  process.exit(0);
}
