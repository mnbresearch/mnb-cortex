#!/usr/bin/env node
/**
 * Tests for the insight generator.
 *
 *   npm run test:insights
 *
 * These numbers go on a finance dashboard and into the AI's context, so the
 * bar is not "produces output" — it is "never says something false". The cases
 * below are weighted accordingly: roughly half assert that an insight is NOT
 * emitted, because the expensive failure here is inventing a problem a business
 * does not have and sending the owner chasing it.
 *
 * Compiles and imports the real module. No reimplementation, no mocks.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "cortex-insights-"));

// Compile the REAL module rather than reimplementing it here. A test that
// reasons about a copy of the logic tests the copy.
try {
  execFileSync(join(ROOT, "node_modules", ".bin", "tsc"), [
    "src/lib/insights.ts", "--outDir", out,
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
  ], { cwd: ROOT, stdio: "inherit" });
} catch {
  console.error("Could not compile src/lib/insights.ts");
  process.exit(1);
}

const { deriveInsights, inrShort } = await import(join(out, "insights.js"));

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/** A workspace with nothing wrong and nothing loaded. */
const base = {
  hasSales: false, hasInvoices: false, hasStock: false, hasStaff: false, hasBank: false,
  revenueNow: 0, revenuePrev: 0, ordersNow: 0, ordersUnset: 0,
  openRecv: 0, overdueRecv: 0, openPay: 0,
  itemCount: 0, belowReorder: 0, coverDays: null, stockValue: 0,
  avgAttrition: 0, avgAttend: 0, payroll: 0,
  cashClosing: 0, avgNet: 0,
};
const S = (o) => ({ ...base, ...o });
const titles = (r) => r.map((i) => i.title).join(" | ");
const has = (r, re) => r.some((i) => re.test(i.title));

console.log("\nEmpty and healthy workspaces must stay quiet");
check("a brand-new empty workspace produces no insights", deriveInsights(base).length === 0);
check("a healthy business produces no false alarms", deriveInsights(S({
  hasSales: true, hasInvoices: true, hasStock: true, hasStaff: true,
  revenueNow: 5_000_000, revenuePrev: 4_800_000, ordersNow: 40,
  openRecv: 2_000_000, overdueRecv: 0, openPay: 500_000,
  itemCount: 50, belowReorder: 0, coverDays: 45, stockValue: 3_000_000,
  avgAttrition: 0.05, avgAttend: 96, payroll: 800_000,
})).length === 0);

console.log("\nReceivables");
let r = deriveInsights(S({ hasInvoices: true, openRecv: 1_000_000, overdueRecv: 400_000 }));
check("40% overdue is flagged red", r.some((i) => /past its due date/.test(i.title) && i.severity === "red"));
check("the overdue amount is stated correctly", has(r, /₹4\.00 L/));
r = deriveInsights(S({ hasInvoices: true, openRecv: 1_000_000, overdueRecv: 50_000 }));
check("5% overdue is green, not alarming", r.find((i) => /past its due/.test(i.title))?.severity === "green");
check("nothing overdue produces no receivables insight",
  !has(deriveInsights(S({ hasInvoices: true, openRecv: 1_000_000, overdueRecv: 0 })), /past its due/));

console.log("\nCash runway — must not appear for a profitable business");
check("profitable business gets no runway warning",
  !has(deriveInsights(S({ hasBank: true, cashClosing: 5_000_000, avgNet: 200_000 })), /months of cash/));
r = deriveInsights(S({ hasBank: true, cashClosing: 1_000_000, avgNet: -500_000 }));
check("2 months of runway is red", r.some((i) => /2\.0 months of cash/.test(i.title) && i.severity === "red"));
check("9 months of runway is green",
  deriveInsights(S({ hasBank: true, cashClosing: 4_500_000, avgNet: -500_000 }))
    .find((i) => /months of cash/.test(i.title))?.severity === "green");
check("zero cash produces no divide-by-zero nonsense",
  !has(deriveInsights(S({ hasBank: true, cashClosing: 0, avgNet: -500_000 })), /months of cash/));

console.log("\nRevenue direction");
check("a 5% dip is noise, not an insight",
  !has(deriveInsights(S({ hasSales: true, revenueNow: 950_000, revenuePrev: 1_000_000 })), /down/));
check("a 30% drop is red",
  deriveInsights(S({ hasSales: true, revenueNow: 700_000, revenuePrev: 1_000_000 }))
    .find((i) => /down 30%/.test(i.title))?.severity === "red");
check("growth is reported too, not only bad news",
  has(deriveInsights(S({ hasSales: true, revenueNow: 1_500_000, revenuePrev: 1_000_000 })), /up 50%/));
check("no prior month means no percentage claim",
  !has(deriveInsights(S({ hasSales: true, revenueNow: 1_000_000, revenuePrev: 0 })), /up |down /));

console.log("\nThe ₹0-revenue trap (orders imported without a status)");
r = deriveInsights(S({ hasSales: true, revenueNow: 0, ordersNow: 500, ordersUnset: 500 }));
check("500 unset orders with zero revenue is flagged red", r.some((i) => /not counted in revenue/.test(i.title) && i.severity === "red"));
check("it says how many", has(r, /500 orders not counted/));
check("singular grammar for one order",
  has(deriveInsights(S({ hasSales: true, ordersNow: 1, ordersUnset: 1 })), /1 order not counted/));
check("no unset orders means no such insight",
  !has(deriveInsights(S({ hasSales: true, revenueNow: 100, ordersNow: 5, ordersUnset: 0 })), /not counted/));

console.log("\nStock and people");
check("9 of 50 below reorder is yellow",
  deriveInsights(S({ hasStock: true, itemCount: 50, belowReorder: 9 }))
    .find((i) => /below reorder/.test(i.title))?.severity === "yellow");
check("20 of 50 below reorder is red",
  deriveInsights(S({ hasStock: true, itemCount: 50, belowReorder: 20 }))
    .find((i) => /below reorder/.test(i.title))?.severity === "red");
check("45 days of cover is not flagged",
  !has(deriveInsights(S({ hasStock: true, itemCount: 10, coverDays: 45 })), /inventory cover/));
check("5 days of cover is red",
  deriveInsights(S({ hasStock: true, itemCount: 10, coverDays: 5 }))
    .find((i) => /inventory cover/.test(i.title))?.severity === "red");
check("low attrition is not mentioned",
  !has(deriveInsights(S({ hasStaff: true, avgAttrition: 0.05, avgAttend: 95 })), /attrition/));
check("40% attrition risk is red",
  deriveInsights(S({ hasStaff: true, avgAttrition: 0.4, payroll: 900_000 }))
    .find((i) => /attrition/.test(i.title))?.severity === "red");
check("attendance of 0 (never recorded) is not reported as 0%",
  !has(deriveInsights(S({ hasStaff: true, avgAttend: 0 })), /attendance/));

console.log("\nWorking capital and payables");
check("negative working capital is red",
  deriveInsights(S({ hasInvoices: true, openRecv: 100_000, stockValue: 0, openPay: 900_000 }))
    .find((i) => /Working capital is negative/.test(i.title))?.severity === "red");
check("healthy working capital is silent",
  !has(deriveInsights(S({ hasInvoices: true, openRecv: 900_000, stockValue: 500_000, openPay: 100_000 })), /Working capital/));
check("owing more than you are owed is flagged",
  has(deriveInsights(S({ hasInvoices: true, openRecv: 100_000, openPay: 500_000 })), /more than you are owed/));

console.log("\nOrdering and limits");
r = deriveInsights(S({
  hasSales: true, hasInvoices: true, hasStock: true, hasStaff: true, hasBank: true,
  revenueNow: 100_000, revenuePrev: 1_000_000, ordersNow: 10, ordersUnset: 10,
  openRecv: 100_000, overdueRecv: 90_000, openPay: 900_000,
  itemCount: 10, belowReorder: 8, coverDays: 2, stockValue: 0,
  avgAttrition: 0.5, avgAttend: 60, payroll: 500_000,
  cashClosing: 100_000, avgNet: -500_000,
}));
check("a business in trouble gets red insights first", r[0]?.severity === "red");
check("output is capped at the limit", deriveInsights(S({
  hasSales: true, hasInvoices: true, hasStock: true, hasStaff: true, hasBank: true,
  revenueNow: 1, revenuePrev: 1_000_000, ordersUnset: 5, ordersNow: 5,
  openRecv: 1, overdueRecv: 1, openPay: 999_999, itemCount: 5, belowReorder: 5,
  coverDays: 1, avgAttrition: 0.9, avgAttend: 10, cashClosing: 1, avgNet: -1,
}), 3).length <= 3);
check("every insight carries at least one action",
  r.every((i) => Array.isArray(i.recommended_actions) && i.recommended_actions.length > 0));
check("every severity is a valid health_status value",
  r.every((i) => ["green", "yellow", "red"].includes(i.severity)));
check("no insight has an empty title or detail", r.every((i) => i.title.length > 5 && i.detail.length > 10));

console.log("\nMoney formatting");
check("crore", inrShort(45_000_000) === "₹4.50 Cr");
check("lakh", inrShort(450_000) === "₹4.50 L");
check("thousand", inrShort(4_500) === "₹4.5k");
check("negative", inrShort(-450_000) === "-₹4.50 L");
check("zero", inrShort(0) === "₹0");

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed`); process.exit(1); }
console.log(`all ${pass} passed`);
