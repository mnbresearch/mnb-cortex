/*
  THE WORKBOOK TRANSFORM ENGINE, EXECUTED.

  /excel lets a person upload their own spreadsheet and say, in words, what
  should change. A model turns the sentence into a plan; THIS code decides
  whether the plan is allowed and then performs it. The safety argument:

    1. Only the twelve named operations exist. Anything else the model
       invents is refused with a reason, never silently dropped.
    2. Every column a plan touches must exist in the sheet at that step.
    3. A calculated column is arithmetic over columns and numbers, plus
       ROUND. No other function, no text, no cell references — so model
       output can never become an arbitrary Excel formula.
    4. The formula written to the workbook is generated from the parsed
       tree, never from the model's string.
    5. Applying a valid plan produces exactly the rows and columns the
       preview promised (the diff IS the result, not an estimate).

  All five are executed against real tables below. Imports the engine
  directly — transform.ts has no dependencies, which is deliberate.

  Run: node --experimental-strip-types --no-warnings scripts/test-transform-engine.mjs
*/
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const T = await import(join(ROOT, "src/lib/engine/transform.ts"));

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error("  ✗", msg); } };
const section = (s) => console.log(`\n${s}`);

const COLS = ["Party", "Amount", "Status", "Due date", "Notes"];
const table = {
  columns: COLS,
  rows: [
    { Party: "Acme", Amount: 1000, Status: "Paid", "Due date": new Date("2026-09-01"), Notes: " ok " },
    { Party: "Beta", Amount: 2500, Status: "Open", "Due date": new Date("2026-10-10"), Notes: "" },
    { Party: "acme", Amount: 1000, Status: "Open", "Due date": null, Notes: null },
    { Party: "Gamma", Amount: 400, Status: "Open", "Due date": new Date("2026-08-15"), Notes: "late" },
    { Party: null, Amount: null, Status: null, "Due date": null, Notes: null },
    { Party: "Delta", Amount: "750", Status: "Overdue", "Due date": new Date("2026-07-01"), Notes: "=HYPERLINK(\"x\")" },
  ],
};

section("1. Only known operations, with reasons");
{
  const r = T.validatePlan([{ op: "delete_everything" }], COLS);
  ok(!r.ok && /not an operation Cortex can perform/.test(r.problems[0]), "unknown op is refused with a reason");
  ok(!T.validatePlan([], COLS).ok, "empty plan refused");
  ok(!T.validatePlan("sort", COLS).ok, "non-array refused");
  ok(!T.validatePlan(Array.from({ length: T.MAX_OPS + 1 }, () => ({ op: "trim_whitespace" })), COLS).ok, "over MAX_OPS refused");
  ok(T.validatePlan(Array.from({ length: T.MAX_OPS }, () => ({ op: "trim_whitespace" })), COLS).ok, "exactly MAX_OPS accepted");
  const names = new Set(T.OP_NAMES);
  for (const n of names) {
    const probe = { op: n, column: "Amount", columns: ["Amount"], from: "Notes", to: "Memo", name: "X", expr: "Amount", group_by: "Party", sum: "Amount", cmp: "gt", value: 1, dir: "asc" };
    ok(T.validatePlan([probe], COLS).ok, `catalogue op "${n}" validates with a well-formed step`);
  }
  // Every op name the validator switch handles is in OP_NAMES and vice versa — no undocumented verb.
  const src = read("src/lib/engine/transform.ts");
  const handled = new Set([...src.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]).filter((c) => names.has(c) || /^[a-z_]+$/.test(c)));
  for (const n of names) ok(handled.has(n), `validator handles "${n}"`);
}

section("2. Columns must exist at that step");
{
  ok(!T.validatePlan([{ op: "sort", column: "Nope", dir: "asc" }], COLS).ok, "sort on missing column refused");
  ok(!T.validatePlan([{ op: "filter", column: "Nope", cmp: "eq", value: 1 }], COLS).ok, "filter on missing column refused");
  ok(!T.validatePlan([{ op: "filter", column: "Amount", cmp: "like", value: 1 }], COLS).ok, "unknown comparison refused");
  ok(!T.validatePlan([{ op: "filter", column: "Amount", cmp: "gt" }], COLS).ok, "comparison without value refused");
  ok(T.validatePlan([{ op: "filter", column: "Notes", cmp: "empty" }], COLS).ok, "empty needs no value");
  ok(!T.validatePlan([{ op: "keep_columns", columns: ["Amount", "Ghost"] }], COLS).ok, "keep_columns with a ghost refused");
  ok(!T.validatePlan([{ op: "drop_columns", columns: COLS }], COLS).ok, "dropping every column refused");
  ok(!T.validatePlan([{ op: "rename", from: "Amount", to: "Party" }], COLS).ok, "rename onto an existing name refused");
  // Sequencing: after a rename, the old name is gone and the new one is usable.
  ok(!T.validatePlan([{ op: "rename", from: "Amount", to: "Amt" }, { op: "sort", column: "Amount", dir: "asc" }], COLS).ok, "old name unusable after rename");
  ok(T.validatePlan([{ op: "rename", from: "Amount", to: "Amt" }, { op: "sort", column: "Amt", dir: "asc" }], COLS).ok, "new name usable after rename");
  ok(!T.validatePlan([{ op: "drop_columns", columns: ["Amount"] }, { op: "sort", column: "Amount", dir: "asc" }], COLS).ok, "dropped column unusable afterwards");
  ok(T.validatePlan([{ op: "add_column", name: "GST", expr: "Amount * 0.18" }, { op: "add_column", name: "Total", expr: "Amount + GST" }], COLS).ok, "added column usable in the next step");
  ok(!T.validatePlan([{ op: "add_column", name: "Amount", expr: "1" }], COLS).ok, "add_column onto existing name refused");
  ok(!T.validatePlan([{ op: "subtotal", group_by: "Party", sum: "Ghost" }], COLS).ok, "subtotal on ghost refused");
}

section("3. The expression grammar is closed");
{
  const good = ["Amount * 0.18", "(Amount + 10) / 2", "-Amount", "ROUND(Amount * 1.18, 2)", "`Due date` * 0", "Amount", "12.5"];
  for (const e of good) ok(T.parseExpr(e, COLS).ok, `accepts ${e}`);
  const bad = [
    "SUM(A1:A9)", "HYPERLINK(\"http://x\")", "Amount & \"x\"", "A1", "=Amount", "Amount ^ 2", "IF(Amount>1,1,0)",
    "Amount * Ghost", "'Amount'", "Amount +", "ROUND(Amount)", "ROUND(Amount, x)", "", "x".repeat(201), "Amount; DROP", "INDIRECT(\"A1\")",
    "1e9", "0x10",
  ];
  for (const e of bad) ok(!T.parseExpr(e, COLS).ok, `rejects ${JSON.stringify(e.slice(0, 30))}`);
  // ROUND digits are capped so a model cannot ask for absurd precision.
  const r = T.parseExpr("ROUND(Amount, 99)", COLS);
  ok(r.ok && r.node.d === 6, "ROUND digits capped at 6");
}

section("4. Formulas come from the tree, not the string");
{
  const letter = (name) => T.colLetterFor(COLS.indexOf(name));
  const p = T.parseExpr("ROUND((Amount + `Due date`) * 0.18, 2)", COLS);
  ok(p.ok, "parses");
  const f = T.toFormula(p.node, letter, 7);
  ok(f === "ROUND(((B7+D7)*0.18),2)", `formula is generated from the tree: ${f}`);
  ok(!/Amount|Due date/.test(f), "no column names leak into the formula");
  ok(T.colLetterFor(0) === "A" && T.colLetterFor(25) === "Z" && T.colLetterFor(26) === "AA" && T.colLetterFor(27) === "AB" && T.colLetterFor(701) === "ZZ" && T.colLetterFor(702) === "AAA", "column letters");
  const neg = T.parseExpr("-Amount", COLS);
  ok(T.toFormula(neg.node, letter, 2) === "-(B2)", "negation is parenthesised");
  // The server never calls toFormula with the model string; grep the one call site.
  const srv = read("src/lib/engine/transform-server.ts");
  ok(/parseExpr\(/.test(srv) && /toFormula\(/.test(srv), "server parses then renders");
  ok(!/formula:\s*[`'"]?=?\s*\$\{?\s*(op|o|step)\.expr/.test(srv), "server never writes op.expr as a formula");
  ok(/safeText|\bstartsWith\(["'=]|\/\^\[=\+\-@\]\//.test(srv) || /safeText/.test(read("src/lib/engine/xlsx.ts")), "text cells pass through the formula-injection guard");
}

section("5. The preview is the result");
{
  const plan = T.validatePlan([
    { op: "remove_empty_rows" },
    { op: "trim_whitespace" },
    { op: "filter", column: "Status", cmp: "neq", value: "Paid" },
    { op: "sort", column: "Amount", dir: "desc" },
    { op: "add_column", name: "GST", expr: "ROUND(Amount * 0.18, 2)" },
    { op: "rename", from: "Notes", to: "Memo" },
    { op: "drop_columns", columns: ["Due date"] },
    { op: "subtotal", group_by: "Party", sum: "Amount" },
  ], COLS);
  ok(plan.ok, `composite plan validates: ${plan.ok ? "" : plan.problems.join("; ")}`);
  ok(plan.ok && plan.describe.length === 8, "one sentence per step");
  const out = T.applyPlan(table, plan.ops);
  const d = out.diff;
  ok(d.rowsBefore === 6 && d.rowsAfter === 4, `rows 6 → 4 (blank and Paid removed): got ${d.rowsAfter}`);
  ok(JSON.stringify(d.columnsAfter) === JSON.stringify(["Party", "Amount", "Status", "Memo", "GST"]), `columns: ${d.columnsAfter.join(",")}`);
  ok(d.added.join() === "GST" && d.removed.join() === "Due date" && d.renamed[0].from === "Notes" && d.renamed[0].to === "Memo", "diff bookkeeping");
  ok(out.table.rows.map((r) => r.Party).join(",") === "Beta,acme,Delta,Gamma", `sort desc numeric incl. string "750": ${out.table.rows.map((r) => r.Party).join(",")}`);
  ok(out.table.rows[0].GST === 450 && out.table.rows[2].GST === 135, "GST computed per row with ROUND");
  ok(out.table.rows.every((r) => !("Due date" in r) && !("Notes" in r)), "dropped/renamed keys gone from rows");
  ok(d.formulaColumns.length === 1 && d.formulaColumns[0].name === "GST", "formula column recorded");
  ok(out.subtotalSheets.length === 1 && d.subtotals[0].groups === 4, `subtotal groups: ${d.subtotals[0]?.groups}`);
  ok(d.sample.length === Math.min(8, d.rowsAfter) && JSON.stringify(d.sample) === JSON.stringify(out.table.rows.slice(0, 8)), "sample is the head of the real result");
  ok(table.rows.length === 6 && table.rows[0].Notes === " ok ", "input table is not mutated");
  const before = table.rows.map((r) => r.Party).join(",");
  T.applyPlan(table, [{ op: "sort", column: "Amount", dir: "desc" }]);
  T.applyPlan(table, [{ op: "uppercase", column: "Party" }]);
  ok(table.rows.map((r) => r.Party).join(",") === before, "a sort-only or case-only plan does not reorder or rewrite the caller's rows");

  // dedupe: case/space-insensitive on named columns, keeps first
  const dd = T.applyPlan(table, T.validatePlan([{ op: "dedupe", columns: ["Party", "Amount"] }], COLS).ops);
  ok(dd.diff.rowsAfter === 5 && dd.table.rows.filter((r) => String(r.Party).toLowerCase() === "acme").length === 1, "dedupe folds Acme/acme with equal amount");
  // filter comparisons
  const f = (cmp, value, col = "Amount") => T.applyPlan(table, [{ op: "filter", column: col, cmp, value }]).diff.rowsAfter;
  ok(f("gt", 900) === 3, `gt 900 → 3 (1000,2500,1000; "750" is below): got ${f("gt", 900)}`);
  ok(f("gte", "1000") === 3, "gte with string number");
  ok(f("contains", "ACM", "Party") === 2, "contains is case-insensitive");
  ok(f("empty", undefined, "Due date") === 2, "empty on dates");
  ok(f("eq", "open", "Status") === 3, "eq on text is case-insensitive");
  // case ops leave non-strings alone
  const up = T.applyPlan(table, [{ op: "uppercase", column: "Party" }]);
  ok(up.table.rows[0].Party === "ACME" && up.table.rows[4].Party === null, "uppercase skips null");
  const tc = T.applyPlan(table, [{ op: "titlecase", column: "Party" }]);
  ok(tc.table.rows[2].Party === "Acme", "titlecase");
  // keep_columns preserves sheet order, not request order
  const kc = T.applyPlan(table, [{ op: "keep_columns", columns: ["Status", "Party"] }]);
  ok(kc.diff.columnsAfter.join() === "Party,Status", "keep_columns preserves original order");
  // division by zero yields a blank, not Infinity
  const dz = T.applyPlan({ columns: ["A", "B"], rows: [{ A: 1, B: 0 }] }, [{ op: "add_column", name: "C", expr: "A / B" }]);
  ok(dz.table.rows[0].C === null, "divide by zero → blank");
  // summary never includes more than 3 rows and truncates cells
  const s = T.summarise({ columns: ["A"], rows: Array.from({ length: 50 }, (_, i) => ({ A: "x".repeat(100) + i })) });
  ok(s.split("\n").length === 6 && !/x{41}/.test(s), "summary is shape-only: 3 rows, cells truncated");
  ok(/Amount \(number\)/.test(T.summarise(table)) && /Due date \(date\)/.test(T.summarise(table)), "summary types columns");
}

section("6. Wiring");
{
  const cat = read("src/lib/engine/catalogue.ts");
  ok(/key:\s*"transform_workbook"/.test(cat), "transform_workbook is in the catalogue");
  const nav = read("src/lib/nav.ts");
  ok(/href:\s*"\/excel"/.test(nav), "/excel is in the nav");
  const page = read("src/app/(app)/excel/page.tsx");
  ok(/hasRole\("analyst"\)/.test(page), "page gates on analyst");
  for (const r of ["plan", "apply"]) {
    const src = read(`src/app/api/transform/${r}/route.ts`);
    ok(/hasRole\("analyst"\)/.test(src), `${r} route gates on analyst`);
    ok(/MAX_UPLOAD_BYTES/.test(src), `${r} route enforces the upload cap`);
    ok(/validatePlan|planWithModel/.test(src), `${r} route validates the plan server-side`);
  }
  const apply = read("src/app/api/transform/apply/route.ts");
  ok(/validatePlan\(/.test(apply), "apply re-validates ops from the browser (never trusts the client)");
  const comp = read("src/components/excel-transform.tsx");
  ok(/\/api\/transform\/plan/.test(comp) && /\/api\/transform\/apply/.test(comp), "component calls both routes");
  ok(/Approve/.test(comp), "component has an explicit approve step");
  const cfg = read("src/lib/config.ts");
  ok(/transform_plan/.test(cfg), "transform_plan is priced");
}

section("7. Indian number formats (CSV cells are text)");
{
  ok(T.toNum("1,20,000") === 120000 && T.toNum("₹ 45,000.50") === 45000.5 && T.toNum("Rs. 900") === 900, "lakh commas, ₹ and Rs. parse");
  ok(T.toNum("(1,200)") === -1200 && T.toNum("5,000/-") === 5000, "bracketed negatives and /- parse");
  ok(Number.isNaN(T.toNum("2026-01-05")) && Number.isNaN(T.toNum("abc")) && Number.isNaN(T.toNum("")), "dates, words and blanks are not numbers");
  const csv = { columns: ["Party", "Amount"], rows: [{ Party: "A", Amount: "1,20,000" }, { Party: "B", Amount: "9,000" }, { Party: "A", Amount: "30,000" }] };
  ok(T.applyPlan(csv, [{ op: "filter", column: "Amount", cmp: "gt", value: 100000 }]).diff.rowsAfter === 1, "a numeric filter over lakh-formatted text compares as numbers");
  const st = T.applyPlan(csv, [{ op: "subtotal", group_by: "Party", sum: "Amount" }]).subtotalSheets[0].rows;
  ok(st.find((r) => r.Party === "A")["Total Amount"] === 150000, "subtotals sum lakh-formatted text");
  const srt = T.applyPlan(csv, [{ op: "sort", column: "Amount", dir: "desc" }]).table.rows.map((r) => r.Amount).join("|");
  ok(srt === "1,20,000|30,000|9,000", `sort is numeric, not lexical: ${srt}`);
  const gst = T.applyPlan(csv, [{ op: "add_column", name: "GST", expr: "Amount * 0.18" }]).table.rows[0].GST;
  ok(gst === 21600, "calculated columns read lakh-formatted text");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
