/*
  SCHEDULED REPORTS: every mode the form offers must produce what it says.

  Found while adding the MIS pack: "report" had no MODE_PROMPTS entry, so
  generateFor() silently fell back to the three-sentence pulse and a scheduled
  monthly review arrived as a pulse. Nothing failed; it was just wrong. This
  pins the contract between the form, the server whitelist, the generators,
  and the new attachment path.

  Run: node scripts/test-scheduled-reports.mjs
*/
import { readFileSync } from "node:fs";
let pass = 0; const fails = [];
const check = (c, n, d = "") => (c ? pass++ : fails.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");

const page = read("src/app/(app)/reports/page.tsx");
const formModes = JSON.parse(page.match(/const MODES = (\[[^\]]+\])/)[1]);
const actions = read("src/lib/actions.ts");
const serverModes = JSON.parse(actions.match(/const REPORT_MODES = (\[[^\]]+\])/)[1]);
check(JSON.stringify(formModes) === JSON.stringify(serverModes), "the form's modes and the server whitelist are the same list", `${formModes} vs ${serverModes}`);
check(/if \(!REPORT_MODES\.includes\(mode\)\) return fail/.test(actions), "the server refuses a mode outside the list");

const cortex = read("src/lib/ai/cortex.ts");
const prompts = new Set([...cortex.slice(cortex.indexOf("const MODE_PROMPTS")).matchAll(/^  ([a-z_]+): `/gm)].map((m) => m[1]));
const sched = read("src/lib/scheduled-reports.ts");
for (const m of serverModes) {
  if (m === "mis_pack") { check(/String\(r\.mode\) === "mis_pack"/.test(sched), "mis_pack has its own branch"); continue; }
  if (m === "report") { check(/String\(r\.mode\) === "report" \? generateReport\(context\)/.test(sched), "report uses generateReport, not the pulse fallback"); continue; }
  check(prompts.has(m), `mode "${m}" has a MODE_PROMPTS entry (otherwise generateFor falls back to pulse)`);
}

const misBranch = sched.slice(sched.indexOf('String(r.mode) === "mis_pack"'), sched.indexOf("} else {", sched.indexOf('String(r.mode) === "mis_pack"')));
check(/buildWorkbook\("mis_pack"/.test(misBranch) && /attachments = \[\{ filename, content: buffer \}\]/.test(misBranch), "the MIS pack is attached as the workbook");
check(!/chargeOrgForMode/.test(misBranch), "the MIS pack charges no AI credits");
check(/escapeHtml\(title\)/.test(misBranch), "the business name in the subject/heading is escaped in HTML");
check(/attachments \}\);/.test(sched) && /orgId: r\.org_id/.test(sched), "the shared send passes attachments and records kind/org");
check(/refundIfCharged\(gate, /.test(sched), "an AI report that produced nothing is refunded");

const email = read("src/lib/email.ts");
check(/total > 10 \* 1_048_576/.test(email), "attachments are capped at 10 MB and refused (recorded) above it");
check(/content: a\.content\.toString\("base64"\)/.test(email), "attachments are sent base64, as Resend expects");
check(/filename: a\.filename\.replace\(\/\[\^A-Za-z0-9\._-\]\+\/g, "-"\)/.test(email), "attachment filenames are reduced to a header-safe character set");

console.log(`\nscheduled reports: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
