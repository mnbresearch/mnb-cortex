/**
 * Test suite for Custom 7-Day Demo Account & Feature Configuration Engine.
 */

import {
  DEMO_FEATURE_CATALOGUE,
  DEMO_PRESETS,
  DEMO_TRIAL_DURATION_DAYS,
  DEMO_DEFAULT_STARTING_CREDITS,
  calculateDemoExpiry,
  isDemoCompulsoryUpgradeRequired,
  generateDemoWelcomeEmail,
} from "../src/lib/demo-workspace.ts";
import { isLocked } from "../src/lib/paywall.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Custom 7-Day Demo Account & Feature Customization Engine ===");

// 1. Duration and Default Credit Invariants
{
  check(DEMO_TRIAL_DURATION_DAYS === 7, "Demo trial duration is strictly 7 days");
  check(DEMO_DEFAULT_STARTING_CREDITS === 2500, "Default demo starting credits is 2,500");
}

// 2. Feature Catalogue Coverage
{
  check(DEMO_FEATURE_CATALOGUE.length >= 18, `Catalogue defines ${DEMO_FEATURE_CATALOGUE.length} customizable features (>=18)`);
  for (const f of DEMO_FEATURE_CATALOGUE) {
    check(Boolean(f.id && f.name && f.category && f.description), `Feature ${f.id} has complete metadata`);
    check(Array.isArray(f.routes) && f.routes.length > 0, `Feature ${f.id} maps to real routes`);
  }
}

// 3. Presets Integrity
{
  check(DEMO_PRESETS.length >= 5, "At least 5 presets defined (including Full Enterprise and Custom)");
  const full = DEMO_PRESETS.find((p) => p.id === "enterprise_full");
  check(full && full.featureIds.length === DEMO_FEATURE_CATALOGUE.length, "Full enterprise preset includes every feature in the catalogue");

  const cfo = DEMO_PRESETS.find((p) => p.id === "cfo_compliance");
  check(cfo && cfo.featureIds.includes("msme_43bh") && cfo.featureIds.includes("form3cd_clause22") && cfo.featureIds.includes("gst_sentinel"),
    "CFO preset includes 43B(h), Form 3CD Clause 22, and GST Sentinel");

  const cash = DEMO_PRESETS.find((p) => p.id === "cashflow_recovery");
  check(cash && cash.featureIds.includes("receivables") && cash.featureIds.includes("collections") && cash.featureIds.includes("msme_samadhaan"),
    "Cash flow preset includes Receivables, Collections, and MSME Samadhaan");
}

// 4. 7-Day Expiry Mathematics
{
  const start = new Date("2026-10-26T12:00:00Z");
  const expiry = calculateDemoExpiry(start, 7);
  const end = new Date(expiry.expiresAt);
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  check(diffDays === 7, "Expiry is exactly 7 days (604,800,000 ms) from start");

  // During trial (day 3): Not expired
  const day3 = new Date("2026-10-29T12:00:00Z").getTime();
  const statusMid = isDemoCompulsoryUpgradeRequired(expiry.expiresAt, day3);
  check(!statusMid.expired, "Day 3 is not expired");
  check(statusMid.daysRemaining === 4, "Day 3 reports 4 days remaining");

  // After trial (day 8): Expired
  const day8 = new Date("2026-11-03T12:00:00Z").getTime();
  const statusAfter = isDemoCompulsoryUpgradeRequired(expiry.expiresAt, day8);
  check(statusAfter.expired, "Day 8 is marked expired");
  check(statusAfter.daysRemaining === 0, "Day 8 reports 0 days remaining");
}

// 5. Compulsory Upgrade Paywall Enforcement
{
  // Standard account with expired trial but 500 leftover credits: NOT locked (can spend credits)
  const standardLapsedWithCredits = {
    enforceable: true,
    status: "expired",
    blocked: false,
    credits: 500,
    unlimited: false,
    compulsoryUpgrade: false,
  };
  check(!isLocked(standardLapsedWithCredits), "Standard pay-as-you-go customer with credits is allowed past paywall");

  // Demo account with expired trial and 2,500 leftover credits: STRICTLY LOCKED (compulsory upgrade!)
  const demoExpiredWithCredits = {
    enforceable: true,
    status: "expired",
    blocked: false,
    credits: 2500,
    unlimited: false,
    compulsoryUpgrade: true,
  };
  check(isLocked(demoExpiredWithCredits), "Demo customer past 7 days IS COMPULSORILY LOCKED even with 2,500 credits");

  // Demo account active on day 3: NOT locked
  const demoActiveDay3 = {
    enforceable: true,
    status: "trialing",
    blocked: false,
    credits: 2500,
    unlimited: false,
    compulsoryUpgrade: true,
  };
  check(!isLocked(demoActiveDay3), "Active demo customer during 7 days is NOT locked");
}

// 6. Onboarding Email Generation
{
  const email = generateDemoWelcomeEmail({
    recipientName: "Aditya",
    email: "aditya@sharmaforgings.in",
    companyName: "Sharma Forgings Pvt Ltd",
    presetName: "CFO & Statutory Tax Compliance",
    features: ["msme_43bh", "form3cd_clause22", "gst_sentinel"],
    expiresAtDateStr: "2 Nov 2026",
    credits: 2500,
    appUrl: "https://cortex.mnbresearch.com",
  });

  check(email.includes("Sharma Forgings Pvt Ltd"), "Email contains company name");
  check(email.includes("7-day customized demo workspace"), "Email announces 7-day demo");
  check(email.includes("2 Nov 2026"), "Email specifies exact 7-day expiration date");
  check(email.includes("2,500"), "Email mentions starting credits");
  check(email.includes("Section 43B(h)"), "Email lists customized modules");
  check(email.includes("compulsory plan upgrade is required"), "Email warns of compulsory upgrade upon expiry");
}

if (failures.length > 0) {
  console.error(`\ndemo-account: ${pass} passed, ${failures.length} failed\n`);
  for (const f of failures) console.error("  ✕ " + f);
  process.exit(1);
} else {
  console.log(`\ndemo-account: ${pass} passed, 0 failed`);
  console.log("  ✓ Custom 7-Day Demo Account & Feature Customization Engine fully verified.");
}
