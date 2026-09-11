/*
  WHAT THE IMPORT SCREEN SAYS WHEN IT WORKED.

  Run with:  npm run test:import-outcome

  Two silences are being guarded against, both of them after a SUCCESS, which
  is the hard kind to notice:

    - "4,312 rows detected" then "✓ Imported 1000 rows", with no third
      sentence. Two different causes (a hard cap, and the duplicate-key
      collapse) hid behind one silence, and an owner cannot tell data loss from
      de-duplication — so they have to assume the worse one.

    - The receivables warning was computed during the import, written to a
      table, and discarded. The screen said "✓ Imported 412 rows" and had no
      link on it.

  Executes the real module — import-outcome.ts is pure and its only import is
  an `import type`, which node strips.
*/

import {
  capRows, accountForRows, topWarning, ROW_CEILING, REVALIDATE_AFTER_IMPORT,
} from "../src/lib/import-outcome.ts";

let pass = 0;
const fails = [];
function check(cond, name, detail = "") {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({ i }));

/* ============================================================== the ceiling */
{
  check(ROW_CEILING >= 10000, "the ceiling is high enough for a year of invoices", String(ROW_CEILING));

  const under = capRows(rows(500));
  check(under.rows.length === 500, "under the ceiling: every row kept");
  check(under.cappedAt === null, "under the ceiling: nothing reported");

  const exact = capRows(rows(ROW_CEILING));
  check(exact.rows.length === ROW_CEILING, "exactly at the ceiling: every row kept");
  check(exact.cappedAt === null, "exactly at the ceiling is NOT a cap", String(exact.cappedAt));

  const over = capRows(rows(ROW_CEILING + 1));
  check(over.rows.length === ROW_CEILING, "over the ceiling: trimmed");
  check(over.cappedAt === ROW_CEILING, "over the ceiling: reported", String(over.cappedAt));

  check(capRows(null).rows.length === 0, "null input does not throw");
  check(capRows(rows(5), 2).rows.length === 2, "the ceiling is overridable for tests");
}

/* ===================================== every row accounted for, or no line */
{
  check(Object.keys(accountForRows(400, { cappedAt: null }, 400)).length === 0,
    "counts agree: returns nothing to render");

  /* The duplicate-key collapse. Complete, just smaller — and it must say so,
     because "412 in, 380 saved" otherwise reads as thirty-two lost invoices. */
  const dup = accountForRows(412, { cappedAt: null }, 380);
  check(dup.skipped === 32, "collapse: skipped counted", String(dup.skipped));
  check(/repeated/i.test(dup.skippedReason), "collapse: says the numbers repeated", dup.skippedReason);
  check(/never counted twice/i.test(dup.skippedReason), "collapse: reassures nothing is double counted");
  check(!/not read/i.test(dup.skippedReason), "collapse: does NOT claim rows were unread");

  /* The cap. Rows are genuinely absent and the owner has to act. */
  const cap = accountForRows(12000, { cappedAt: 10000 }, 10000);
  check(cap.skipped === 2000, "cap: skipped counted", String(cap.skipped));
  check(/not read/i.test(cap.skippedReason), "cap: says rows were not read", cap.skippedReason);
  check(/Split the file/i.test(cap.skippedReason), "cap: says what to do about it");
  check(/12,000/.test(cap.skippedReason), "cap: Indian digit grouping", cap.skippedReason);
  check(/2,000/.test(cap.skippedReason), "cap: the overflow figure is grouped too");

  /* Both at once — a capped file that also had repeats. The cap is named,
     because it is the one that means rows are missing from the workspace. */
  const both = accountForRows(12000, { cappedAt: 10000 }, 9500);
  check(both.skipped === 2500, "cap + collapse: total skipped", String(both.skipped));
  check(/not read/i.test(both.skippedReason), "cap + collapse: the cap is what gets named");

  /* Degenerate: written somehow exceeds detected. Never negative. */
  const odd = accountForRows(10, { cappedAt: null }, 20);
  check(Object.keys(odd).length === 0, "written > detected reports nothing rather than a negative");
  check(Object.keys(accountForRows(NaN, { cappedAt: null }, NaN)).length === 0, "NaN counts report nothing");
}

/* ======================================================== the top warning */
{
  check(topWarning(null) === null, "no insights: null");
  check(topWarning([]) === null, "empty insights: null");
  check(topWarning([{ title: "", detail: "x", severity: "red" }]) === null, "a titleless insight is not a warning");

  const list = [
    { module: "sales", severity: "green", title: "Revenue is up 24% on last month", detail: "d", route: "/sales" },
    { module: "hr", severity: "yellow", title: "Average attendance is 81.0%", detail: "d", route: "/hr" },
    { module: "finance", severity: "red", title: "₹42.00 L of receivables is past its due date", detail: "d", route: "/receivables" },
  ];
  const w = topWarning(list);
  check(w.severity === "red", "the RED one wins, whatever order they arrive in", w.severity);
  check(/receivables/i.test(w.title), "the receivables warning is the one shown", w.title);
  check(w.route === "/receivables", "it carries the screen that shows it", w.route);

  /* Order-independence matters: deriveInsights sorts, but a caller that
     reorders or filters must not change which warning the owner sees. */
  const reversed = topWarning(list.slice().reverse());
  check(reversed.title === w.title, "same answer from the reversed list");

  /* Yellow beats green. */
  const y = topWarning([list[0], list[1]]);
  check(y.severity === "yellow", "yellow outranks green", y.severity);

  /* Good news alone is still worth saying — it is a real finding about their
     own data, and silence after an import reads as failure. */
  const g = topWarning([list[0]]);
  check(g !== null && g.severity === "green", "a green-only workspace still gets its finding");

  /* An unknown severity must not outrank a known one. */
  const u = topWarning([{ severity: "chartreuse", title: "odd", detail: "d" }, list[2]]);
  check(u.severity === "red", "an unrecognised severity ranks last", u.severity);

  /* route is optional — an insight without one must not crash the caller. */
  const nr = topWarning([{ severity: "red", title: "no route", detail: "d" }]);
  check(nr !== null && nr.route === undefined, "a routeless insight is returned with route undefined");
}

/* ================================================== revalidation coverage */
{
  const paths = [...REVALIDATE_AFTER_IMPORT];
  /*
    /receivables was the omission that mattered: the screen the product is sold
    on, and the one the post-import warning now links to. The two import paths
    had different lists, each extended once for whatever page its author was
    looking at.
  */
  for (const p of ["/dashboard", "/receivables", "/finance", "/sales", "/inventory", "/hr", "/msme", "/alerts", "/data"]) {
    check(paths.includes(p), `revalidates ${p}`);
  }
  check(new Set(paths).size === paths.length, "no duplicate paths");
  check(paths.every((p) => p.startsWith("/")), "every path is absolute");
}

console.log(`\nimport outcome: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(1);
}
