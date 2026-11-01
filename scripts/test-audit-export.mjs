/**
 * Audit export: one formula-safe CSV of who did what, admins only, read under RLS.
 */
import { readFileSync } from "node:fs";
const A = await import("../src/lib/audit-export.ts");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(n + (d ? `\n      ${d}` : "")));
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* window */
check(A.auditWindowDays(undefined) === 90, "default window is 90 days");
check(A.auditWindowDays("30") === 30, "30 days is honoured");
check(A.auditWindowDays("9999") === 365, "window is capped at a year");
check(A.auditWindowDays("-4") === 90 && A.auditWindowDays("abc") === 90 && A.auditWindowDays("0") === 90, "junk falls back to default");

/* cells */
check(A.csvCell("=HYPERLINK(\"x\")").startsWith("\"'="), "a formula is neutralised and quoted");
for (const c of ["=1+1", "+91 98", "-5", "@SUM(A1)", "\tx", "\rx"]) check(A.csvCell(c).replace(/^"/, "").startsWith("'"), `formula-like ${JSON.stringify(c)} is prefixed`);
check(A.csvCell("a,b") === "\"a,b\"", "commas are quoted");
check(A.csvCell("say \"hi\"") === "\"say \"\"hi\"\"\"", "quotes are doubled");
check(A.csvCell("line1\nline2") === "\"line1\nline2\"", "newlines are quoted");
check(A.csvCell(null) === "" && A.csvCell(undefined) === "", "empty values are empty cells");
check(A.csvCell("plain") === "plain", "plain text is untouched");

/* rows */
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const src = {
  activity: [{ id: "a1", type: "crud", message: "Invoice added", created_at: "2026-10-01T10:00:00Z" }],
  actions: [{ id: "p1", action: "send_reminder", status: "done", source: "autopilot", rationale: "Overdue 30 days", proposed_by: null, policy_verdict: "approve", decided_by: U1, decided_at: "2026-10-03T09:00:00Z", created_at: "2026-10-02T10:00:00Z" }],
  apiKeys: [{ id: "k1", key_id: "kk", key_prefix: "mnb_live_ab", event: "revoked", actor: U2, detail: {}, created_at: "2026-10-04T10:00:00Z" }],
  billing: [{ id: "b1", actor: "system", action: "plan_change", detail: { from: "watch", to: "enterprise" }, created_at: "2026-09-30T10:00:00Z" }],
  credits: [{ id: "c1", user_id: U1, delta: -40, balance_after: 960, reason: "ai:chat", created_at: "2026-10-05T10:00:00Z" }],
};
const names = new Map([[U1, "owner@acme.in"]]);
const rows = A.auditRows(src, names);
check(rows.length === 5, "every source contributes a row");
check(rows.map((r) => r.source).join() === "credits,api_key,action,activity,billing", "rows are newest first", rows.map((r) => r.source).join());
const act = rows.find((r) => r.source === "action");
check(act.actor === "autopilot", "a Cortex-proposed action names its source as actor");
check(/decided by owner@acme\.in/.test(act.detail), "the approver is named by email");
check(/policy: approve/.test(act.detail), "the policy verdict is recorded");
check(rows.find((r) => r.source === "api_key").actor === U2, "an unresolved actor keeps its id");
check(rows.find((r) => r.source === "credits").event === "-40 credits", "credit spend shows its delta");
check(/enterprise/.test(rows.find((r) => r.source === "billing").detail), "billing detail is kept");
check(JSON.stringify(A.actorIds(src).sort()) === JSON.stringify([U1, U2].sort()), "only uuid actors are resolved, once each");
check(A.actorIds({ credits: Array.from({ length: 500 }, (_, i) => ({ user_id: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111` })) }).length === 200, "actor lookups are capped");

const csv = A.auditCsv(rows);
check(csv.startsWith("﻿at,source,actor,event,detail,ref\r\n"), "CSV has a BOM (Excel reads UTF-8) and a header");
check(csv.trim().split("\r\n").length === 6, "one line per row");
check(A.auditCsv(A.auditRows({ activity: [{ id: "x", type: "crud", message: "=cmd|' /C calc'!A0", created_at: "2026-01-01" }] })).includes("'=cmd"), "a hostile message cannot run in Excel");

/* route */
const route = strip(read("src/app/api/workspace/audit-export/route.ts"));
check(/ROLE_RANK\.admin/.test(route) && /status: 403/.test(route), "route is admins only");
check(/await createClient\(\)/.test(route) && /sb\.from\(s\.table\)/.test(route), "rows are read with the user's own session (RLS applies)");
check(!/svc\.from\(/.test(route), "the service role reads no table");
check(/\.eq\("org_id", orgId\)/.test(route), "every read is scoped to the workspace");
check(/isMissingTable\(error\)/.test(route) && /status: 500/.test(route), "a missing table is skipped; any other error fails the download");
check(/from\("activity"\)\.insert/.test(route), "each download is itself recorded");
for (const t of ["activity", "action_proposals", "api_key_events", "org_billing_log", "credit_ledger"]) check(route.includes(`table: "${t}"`), `route exports ${t}`);

/* UI */
const page = read("src/app/(app)/settings/security/page.tsx");
check(/<AuditExportButton \/>/.test(page) && /isAdmin \? <AuditExportButton/.test(page), "security settings offers the download to admins");
check(/\/api\/workspace\/audit-export\?days=/.test(read("src/components/audit-export-button.tsx")), "the button calls the route");

if (failures.length) { console.error(`audit-export: ${failures.length} failed\n  ✗ ` + failures.join("\n  ✗ ")); process.exit(1); }
console.log(`audit-export: ${pass} checks passed`);
