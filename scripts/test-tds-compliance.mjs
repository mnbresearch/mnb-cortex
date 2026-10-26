/**
 * Test suite for Statutory TDS Section 206AB Higher Rate & Section 201 Penal Interest Engine.
 */

import {
  isValidPan,
  computeEffectiveTdsRate,
  getTdsChallanDueDate,
  calculateSection201PenalInterest,
  evaluateTdsBatch,
} from "../src/lib/tds-compliance.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Statutory TDS Section 206AB & Section 201 Engine ===");

// 1. PAN Validation
{
  check(isValidPan("ABCDE1234F"), "Valid individual PAN matches format");
  check(isValidPan("AAACB5678K"), "Valid company PAN matches format");
  check(!isValidPan("INVALID"), "Invalid PAN rejected");
  check(!isValidPan(""), "Empty PAN rejected");
  check(!isValidPan("ABCDE12345"), "Malformed PAN with trailing digit rejected");
}

// 2. Section 206AA (No PAN Penalty)
{
  const noPan194C = computeEffectiveTdsRate("194C", false, false);
  check(noPan194C.rate === 20, "Missing PAN on 194C attracts 20% under Section 206AA");
  check(noPan194C.is206AA === true, "Marked as 206AA violation");

  const noPan194Q = computeEffectiveTdsRate("194Q", false, false);
  check(noPan194Q.rate === 5, "Missing PAN on 194Q attracts 5% per Section 206AA proviso");
}

// 3. Section 206AB (Specified Person / Non-Filer Higher Rate)
{
  // 194C: base is 2%. Higher of (2*2%=4%, 5%) is 5%
  const nonFiler194C = computeEffectiveTdsRate("194C", true, true);
  check(nonFiler194C.rate === 5, `194C for non-filer is 5% (higher of 4% and 5%), got: ${nonFiler194C.rate}`);
  check(nonFiler194C.is206AB === true, "Marked as 206AB non-filer");

  // 194J: base is 10%. Higher of (2*10%=20%, 5%) is 20%
  const nonFiler194J = computeEffectiveTdsRate("194J", true, true);
  check(nonFiler194J.rate === 20, `194J for non-filer is 20% (higher of 20% and 5%), got: ${nonFiler194J.rate}`);

  // 194H: base is 2%. Higher of (2*2%=4%, 5%) is 5%
  const nonFiler194H = computeEffectiveTdsRate("194H", true, true);
  check(nonFiler194H.rate === 5, `194H for non-filer is 5%, got: ${nonFiler194H.rate}`);

  // Compliant vendor with PAN
  const compliant194J = computeEffectiveTdsRate("194J", true, false);
  check(compliant194J.rate === 10, "Compliant vendor with PAN gets standard 10% rate");
}

// 4. Rule 30 Statutory Challan ITNS 281 Due Date
{
  check(getTdsChallanDueDate("2026-08-15") === "2026-09-07", "August deduction due date is 7th September");
  check(getTdsChallanDueDate("2026-03-22") === "2026-04-30", "March deduction due date is 30th April (special statutory rule)");
  check(getTdsChallanDueDate("2026-12-05") === "2027-01-07", "December deduction due date rolls over to 7th January of next year");
}

// 5. Section 201(1A) Delayed Deposit Penal Interest
{
  // On-time deposit
  const onTime = calculateSection201PenalInterest(50000, "2026-08-15", "2026-09-05");
  check(!onTime.isDelayed, "On-time deposit before 7th Sept is not delayed");
  check(onTime.penalInterest === 0, "On-time deposit has nil penal interest");
  check(onTime.totalDepositPayable === 50000, "Total payable is principal TDS amount only");

  // Delayed deposit: deducted 15 Aug 2026, deposited 25 Oct 2026
  // Months: August, September, October = 3 months
  // Interest = 50,000 * 1.5% * 3 = 50,000 * 0.045 = 2,250
  const delayed = calculateSection201PenalInterest(50000, "2026-08-15", "2026-10-25");
  check(delayed.isDelayed === true, "Deposit on 25 Oct for Aug deduction is delayed");
  check(delayed.monthsDelay === 3, `Months delay counted as 3 (got: ${delayed.monthsDelay})`);
  check(delayed.penalInterest === 2250, `Penal interest is ₹2,250 (got: ${delayed.penalInterest})`);
  check(delayed.totalDepositPayable === 52250, "Total payable is principal + interest = ₹52,250");
}

// 6. Batch Evaluation Sanity
{
  const batch = [
    {
      vendorName: "Alpha Logistics",
      pan: "ABCDE1234F",
      sectionCode: "194C",
      paymentAmount: 100000,
      paymentDate: "2026-09-10",
      isSpecifiedPerson206AB: false,
    },
    {
      vendorName: "Beta Transport",
      pan: "XYZAB5678C",
      sectionCode: "194C",
      paymentAmount: 100000,
      paymentDate: "2026-09-12",
      isSpecifiedPerson206AB: true, // Non-filer -> 5%
    },
  ];

  const result = evaluateTdsBatch(batch);
  check(result.totalPayment === 200000, "Total payment is ₹2,00,000");
  check(result.totalTds === 7000, "Total TDS is ₹7,000 (2,000 + 5,000)");
  check(result.totalNetPayable === 193000, "Total net payable is ₹1,93,000");
  check(result.nonFilerCount === 1, "Exactly 1 non-filer identified");
  check(result.noPanCount === 0, "Zero no-PAN vendors identified");
}

console.log(`\ntds compliance: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ Statutory TDS Section 206AB & Section 201 Engine fully verified.");
  process.exit(0);
}
