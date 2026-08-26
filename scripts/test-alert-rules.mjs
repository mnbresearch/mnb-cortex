#!/usr/bin/env node
/**
 * Tests for KPI alert evaluation.  Run: npm run test:alerts
 *
 * Both failure directions are expensive and neither is visible to `tsc`:
 *
 *   never fires  → the product's own subtitle ("get warned the moment a number
 *                  crosses your line") is a lie, and the owner finds out the
 *                  month they run out of cash;
 *   fires wrongly → the owner learns to ignore alerts, which breaks the ONE
 *                  that mattered. This is the worse failure, so most of the
 *                  cases below assert that nothing fires.
 *
 * Compiles and imports the real module.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "cortex-alerts-"));

try {
  execFileSync(join(ROOT, "node_modules", ".bin", "tsc"), [
    "src/lib/alert-rules.ts", "--outDir", out,
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
  ], { cwd: ROOT, stdio: "inherit" });
} catch { console.error("Could not compile src/lib/alert-rules.ts"); process.exit(1); }

const { evaluateRules, isBreached, fmtMetric } = await import(join(out, "alert-rules.js"));

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

const M = (key, value, unit = "", label = key) => ({ metric_key: key, label, value, unit });
const R = (metric_key, op, threshold, extra = {}) => ({ id: `r-${metric_key}-${op}`, metric_key, op, threshold, ...extra });

console.log("\nThe basic comparison");
check("below threshold fires a '<' rule", isBreached(R("cash", "<", 6), M("cash", 3)));
check("above threshold does not fire a '<' rule", !isBreached(R("cash", "<", 6), M("cash", 9)));
check("above threshold fires a '>' rule", isBreached(R("risk", ">", 50), M("risk", 70)));
check("exactly on the threshold does NOT fire", !isBreached(R("cash", "<", 6), M("cash", 6)));
check("exactly on the threshold does NOT fire (>)", !isBreached(R("risk", ">", 50), M("risk", 50)));

console.log("\nMissing data must never raise a false alarm");
check("a rule whose metric is absent does not fire", !isBreached(R("cash", "<", 6), undefined));
check("...even though 'cash below 6' would be true of zero",
  evaluateRules([R("cash", "<", 6)], []).length === 0);
check("a disabled rule does not fire", !isBreached(R("cash", "<", 6, { enabled: false }), M("cash", 1)));
check("NaN metric value does not fire", !isBreached(R("cash", "<", 6), M("cash", NaN)));
check("NaN threshold does not fire", !isBreached(R("cash", "<", NaN), M("cash", 1)));

console.log("\nSeverity reflects how far past the line");
let b = evaluateRules([R("cash", "<", 6)], [M("cash", 5.9, "months", "Cash Runway")]);
check("barely across is yellow", b[0]?.severity === "yellow");
check("...and says it may settle back", /may still settle/.test(b[0]?.body || ""));
b = evaluateRules([R("cash", "<", 6)], [M("cash", 1, "months", "Cash Runway")]);
check("far across is red", b[0]?.severity === "red");
check("...and says it will not correct on its own", /unlikely to correct/.test(b[0]?.body || ""));
check("a zero threshold does not divide by zero",
  evaluateRules([R("profit", "<", 0)], [M("profit", -5000, "INR", "Net profit")])[0]?.severity === "red");

console.log("\nWhat the owner actually reads");
b = evaluateRules([R("receivables", ">", 500000)], [M("receivables", 1200000, "INR", "Receivables Overdue")]);
check("title names the metric and direction", b[0]?.title === "Receivables Overdue is above your limit");
check("body states the current value in rupees", /₹12\.00 L/.test(b[0]?.body || ""));
check("body states the limit that was set", /₹5\.00 L/.test(b[0]?.body || ""));

console.log("\nOrdering and multiples");
b = evaluateRules(
  [R("cash", "<", 6), R("risk", ">", 40), R("orders", "<", 100)],
  [M("cash", 5.8, "months", "Cash Runway"), M("risk", 95, "score", "Risk Score"), M("orders", 99, "count", "Orders")],
);
check("all three breaches are reported", b.length === 3);
check("the worst is listed first", b[0].severity === "red");
check("each breach carries its own rule", b.every((x) => x.rule && x.metric));
check("nothing fires when everything is healthy",
  evaluateRules([R("cash", "<", 6), R("risk", ">", 40)], [M("cash", 12, "months"), M("risk", 10, "score")]).length === 0);
check("an empty rule list produces nothing", evaluateRules([], [M("cash", 0, "months")]).length === 0);

console.log("\nValue formatting");
check("crore", fmtMetric(45_000_000, "INR") === "₹4.50 Cr");
check("lakh", fmtMetric(450_000, "INR") === "₹4.50 L");
check("negative rupees", fmtMetric(-450_000, "INR") === "-₹4.50 L");
check("percent", fmtMetric(92.5, "%") === "92.5%");
check("months", fmtMetric(6, "months") === "6 months");
check("bare count", fmtMetric(42, "count") === "42");

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed`); process.exit(1); }
console.log(`all ${pass} passed`);
