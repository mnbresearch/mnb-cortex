/**
 * Test suite for Native NPCI Dynamic UPI Engine (src/lib/pay/upi.ts).
 */

import {
  validateVpa,
  buildUpiUri,
  generateUpiQrSvg,
  generateUpiQrDataUrl,
  buildUpiAppLinks,
} from "../src/lib/pay/upi.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Native NPCI Dynamic UPI Engine ===");

// 1. VPA Validation
{
  const validCases = [
    "acme@icici",
    "sharma.enterprises@okaxis",
    "billings-2026@okhdfcbank",
    "vendor_99@paytm",
    "support@yesbank",
  ];
  for (const vpa of validCases) {
    const res = validateVpa(vpa);
    check(res.valid === true, `valid VPA accepted: ${vpa}`, res.error);
    check(res.sanitizedVpa === vpa.toLowerCase(), `sanitized VPA matches lowercase: ${vpa}`);
  }

  const invalidCases = [
    "",
    "   ",
    "invalidvpa",
    "@okhdfcbank",
    "acme@",
    "space in@vpa",
    "special!char#@bank",
  ];
  for (const vpa of invalidCases) {
    const res = validateVpa(vpa);
    check(res.valid === false, `invalid VPA rejected: "${vpa}"`);
  }
}

// 2. buildUpiUri Construction & Encoding
{
  const params = {
    payeeVpa: "billing@hdfcbank",
    payeeName: "MNB Cortex Tech Solutions",
    amount: 14999,
    invoiceNo: "INV-2026/0892",
    note: "Settlement for IT Services & AMC Q3",
  };
  const uri = buildUpiUri(params);

  check(uri.startsWith("upi://pay?"), "URI starts with upi://pay?");
  check(uri.includes("pa=billing%40hdfcbank") || uri.includes("pa=billing@hdfcbank"), "VPA included");
  check(uri.includes("am=14999.00"), "Amount formatted with 2 decimal places (14999.00)");
  check(uri.includes("cu=INR"), "Currency is strictly INR");
  check(uri.includes("tr=INV-20260892"), "Invoice ref sanitized of non-alphanumeric/hyphen/underscore");
  check(uri.includes("pn="), "Payee name included");
  check(uri.includes("tn="), "Transaction note included");

  // Clamping negative amounts
  const negUri = buildUpiUri({ ...params, amount: -500 });
  check(negUri.includes("am=0.00"), "Negative amount clamped to 0.00");

  // Note truncation at 80 characters
  const longNote = "A".repeat(120);
  const truncUri = buildUpiUri({ ...params, note: longNote });
  const parsed = new URL(truncUri.replace("upi://", "https://mock.local/"));
  check((parsed.searchParams.get("tn") || "").length <= 80, "Transaction note capped at 80 chars");
}

// 3. QR Code Generation (SVG & DataURL)
{
  const params = {
    payeeVpa: "payments@icici",
    payeeName: "Apex Retailers Ltd",
    amount: 5400.5,
    invoiceNo: "AR-4401",
  };

  const svg = await generateUpiQrSvg(params);
  check(typeof svg === "string" && svg.includes("<svg") && svg.includes("</svg>"), "generateUpiQrSvg returns valid SVG element");
  check(svg.includes("viewBox="), "SVG contains viewBox attribute");

  const dataUrl = await generateUpiQrDataUrl(params);
  check(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"), "generateUpiQrDataUrl returns base64 PNG data URL");
}

// 4. App Deep Links
{
  const params = {
    payeeVpa: "merchants@axisbank",
    payeeName: "Fast Track Logistics",
    amount: 8200,
  };
  const links = buildUpiAppLinks(params);
  check(links.universal.startsWith("upi://pay?"), "universal link valid");
  check(links.googlePay.startsWith("gpay://upi/pay?"), "googlePay link valid");
  check(links.phonePe.startsWith("phonepe://pay?"), "phonePe link valid");
  check(links.paytm.startsWith("paytmmp://pay?"), "paytm link valid");
  check(links.bhim.startsWith("bhim://pay?"), "bhim link valid");
}

console.log(`\nupi: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ Native NPCI Dynamic UPI engine verified (all assertions pass).");
  process.exit(0);
}
