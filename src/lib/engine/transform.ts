/*
  WORKBOOK TRANSFORMS — "upload a sheet, say what to change, get it back."

  ============================================================================
  THE SHAPE, AND WHY IT IS THIS SHAPE
  ============================================================================

  The model does not touch the spreadsheet. It reads a SUMMARY of it (column
  names, types, a few sample rows) and the person's instruction, and produces
  a PLAN: a short list of operations from the closed vocabulary below. The
  plan is validated against that vocabulary — unknown operations, unknown
  columns, malformed arguments are rejected with a reason — and then
  deterministic code applies it. The person sees the plan in words and a diff
  (rows before/after, columns added/removed/renamed, a sample of changed
  rows) BEFORE anything is downloaded.

  So the model is a translator from English to a tiny typed language, and the
  thing that actually rewrites the workbook is code that can be tested on a
  fixture. The same reasoning as the action catalogue.

  ============================================================================
  THE ONE HARD RULE: NO FORMULA TEXT FROM THE MODEL REACHES A CELL
  ============================================================================

  A cell that begins with = is executed by Excel when the file opens. If the
  model could write arbitrary formula text, a poisoned instruction ("add a
  column with =WEBSERVICE(...)") becomes code that runs on the owner's
  machine. So `add_column` takes an EXPRESSION in a grammar this file parses
  itself — column names, numbers, + - * / and parentheses, plus ROUND() — and
  the Excel formula is generated FROM the parsed tree, cell references
  included. Anything the grammar does not accept is rejected. There is no
  path from model output to formula text.

  Every string value that lands in a cell is quote-prefixed if it starts with
  = + - @, as in xlsx.ts.

  This module is pure (no server-only import) so it can be executed by the
  test suite directly.
*/

export type Cell = string | number | boolean | Date | null;
export type Row = Record<string, Cell>;
export type Table = { columns: string[]; rows: Row[] };

export type Op =
  | { op: "filter"; column: string; cmp: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains" | "empty" | "not_empty"; value?: string | number }
  | { op: "sort"; column: string; dir: "asc" | "desc" }
  | { op: "rename"; from: string; to: string }
  | { op: "keep_columns"; columns: string[] }
  | { op: "drop_columns"; columns: string[] }
  | { op: "dedupe"; columns?: string[] }
  | { op: "remove_empty_rows" }
  | { op: "add_column"; name: string; expr: string }
  | { op: "subtotal"; group_by: string; sum: string }
  | { op: "trim_whitespace" }
  | { op: "uppercase"; column: string }
  | { op: "titlecase"; column: string };

export const OP_NAMES = [
  "filter", "sort", "rename", "keep_columns", "drop_columns", "dedupe", "remove_empty_rows",
  "add_column", "subtotal", "trim_whitespace", "uppercase", "titlecase",
] as const;

export const MAX_OPS = 12;
export const MAX_ROWS = 10_000;
export const MAX_COLUMNS = 60;

/* --------------------------------------------------------------- validate */

export type ValidPlan = { ok: true; ops: Op[]; describe: string[] } | { ok: false; problems: string[] };

export function validatePlan(raw: unknown, columns: string[]): ValidPlan {
  const problems: string[] = [];
  if (!Array.isArray(raw)) return { ok: false, problems: ["The plan must be a list of operations."] };
  if (raw.length === 0) return { ok: false, problems: ["The plan is empty — nothing to do."] };
  if (raw.length > MAX_OPS) return { ok: false, problems: [`Too many steps (${raw.length}); the limit is ${MAX_OPS}.`] };

  const cols = new Set(columns);
  const ops: Op[] = [];
  const describe: string[] = [];
  const has = (c: unknown) => typeof c === "string" && cols.has(c);
  const str = (v: unknown) => typeof v === "string" ? v.trim() : "";

  raw.forEach((o: any, i: number) => {
    const n = i + 1;
    const op = String(o?.op || "");
    switch (op) {
      case "filter": {
        const cmp = String(o.cmp || "");
        if (!has(o.column)) { problems.push(`Step ${n}: filter names a column that is not in the sheet (${o.column}).`); return; }
        if (!["eq","neq","gt","gte","lt","lte","contains","not_contains","empty","not_empty"].includes(cmp)) { problems.push(`Step ${n}: unknown comparison "${cmp}".`); return; }
        const needsValue = !["empty","not_empty"].includes(cmp);
        if (needsValue && (o.value === undefined || o.value === null || o.value === "")) { problems.push(`Step ${n}: filter "${cmp}" needs a value.`); return; }
        const value = needsValue ? (typeof o.value === "number" ? o.value : String(o.value).slice(0, 200)) : undefined;
        ops.push({ op: "filter", column: o.column, cmp: cmp as any, value });
        describe.push(`Keep rows where ${o.column} ${CMP_WORDS[cmp]}${needsValue ? ` ${JSON.stringify(value)}` : ""}.`);
        return;
      }
      case "sort": {
        if (!has(o.column)) { problems.push(`Step ${n}: sort names an unknown column (${o.column}).`); return; }
        const dir = o.dir === "desc" ? "desc" : "asc";
        ops.push({ op: "sort", column: o.column, dir });
        describe.push(`Sort by ${o.column}, ${dir === "asc" ? "ascending" : "descending"}.`);
        return;
      }
      case "rename": {
        const from = str(o.from), to = str(o.to);
        if (!has(from)) { problems.push(`Step ${n}: rename names an unknown column (${from}).`); return; }
        if (!to || to.length > 80) { problems.push(`Step ${n}: the new name is missing or too long.`); return; }
        if (cols.has(to)) { problems.push(`Step ${n}: a column called "${to}" already exists.`); return; }
        cols.delete(from); cols.add(to);
        ops.push({ op: "rename", from, to }); describe.push(`Rename "${from}" to "${to}".`); return;
      }
      case "keep_columns": case "drop_columns": {
        const list = Array.isArray(o.columns) ? o.columns.map(str).filter(Boolean) : [];
        const unknown = list.filter((c: string) => !cols.has(c));
        if (!list.length) { problems.push(`Step ${n}: ${op} needs at least one column.`); return; }
        if (unknown.length) { problems.push(`Step ${n}: ${op} names unknown columns (${unknown.join(", ")}).`); return; }
        if (op === "keep_columns") { for (const c of [...cols]) if (!list.includes(c)) cols.delete(c); }
        else { for (const c of list) cols.delete(c); }
        if (cols.size === 0) { problems.push(`Step ${n}: that would remove every column.`); return; }
        ops.push({ op, columns: list } as Op); describe.push(`${op === "keep_columns" ? "Keep only" : "Remove"} columns: ${list.join(", ")}.`); return;
      }
      case "dedupe": {
        const list = Array.isArray(o.columns) ? o.columns.map(str).filter(Boolean) : undefined;
        const unknown = (list || []).filter((c: string) => !cols.has(c));
        if (unknown.length) { problems.push(`Step ${n}: dedupe names unknown columns (${unknown.join(", ")}).`); return; }
        ops.push({ op: "dedupe", columns: list && list.length ? list : undefined });
        describe.push(list && list.length ? `Remove duplicate rows (same ${list.join(" + ")}), keeping the first.` : "Remove exact duplicate rows."); return;
      }
      case "remove_empty_rows": ops.push({ op }); describe.push("Remove rows that are entirely blank."); return;
      case "trim_whitespace": ops.push({ op }); describe.push("Trim leading and trailing spaces in every text cell."); return;
      case "uppercase": case "titlecase": {
        if (!has(o.column)) { problems.push(`Step ${n}: ${op} names an unknown column (${o.column}).`); return; }
        ops.push({ op, column: o.column } as Op); describe.push(`${op === "uppercase" ? "Upper-case" : "Title-case"} the ${o.column} column.`); return;
      }
      case "add_column": {
        const name = str(o.name), expr = str(o.expr);
        if (!name || name.length > 80) { problems.push(`Step ${n}: the new column needs a name.`); return; }
        if (cols.has(name)) { problems.push(`Step ${n}: a column called "${name}" already exists.`); return; }
        const parsed = parseExpr(expr, [...cols]);
        if (!parsed.ok) { problems.push(`Step ${n}: ${parsed.error}`); return; }
        cols.add(name);
        ops.push({ op: "add_column", name, expr }); describe.push(`Add a column "${name}" = ${expr}.`); return;
      }
      case "subtotal": {
        const g = str(o.group_by), sum = str(o.sum);
        if (!has(g) || !has(sum)) { problems.push(`Step ${n}: subtotal needs two existing columns (group_by, sum).`); return; }
        ops.push({ op: "subtotal", group_by: g, sum }); describe.push(`Add a "Subtotals" sheet: total of ${sum} by ${g}.`); return;
      }
      default:
        problems.push(`Step ${n}: "${op}" is not an operation Cortex can perform. Available: ${OP_NAMES.join(", ")}.`);
    }
  });

  return problems.length ? { ok: false, problems } : { ok: true, ops, describe };
}

const CMP_WORDS: Record<string, string> = {
  eq: "equals", neq: "does not equal", gt: "is greater than", gte: "is at least", lt: "is less than", lte: "is at most",
  contains: "contains", not_contains: "does not contain", empty: "is empty", not_empty: "is not empty",
};

/* -------------------------------------------------- the expression grammar */
/*
  expr   := term (('+'|'-') term)*
  term   := factor (('*'|'/') factor)*
  factor := NUMBER | COLUMN | '(' expr ')' | 'ROUND' '(' expr ',' NUMBER ')' | '-' factor
  COLUMN := [identifier] or `quoted name`
*/
type Node =
  | { t: "num"; v: number }
  | { t: "col"; name: string }
  | { t: "bin"; op: "+" | "-" | "*" | "/"; l: Node; r: Node }
  | { t: "neg"; v: Node }
  | { t: "round"; v: Node; d: number };

export function parseExpr(src: string, columns: string[]): { ok: true; node: Node } | { ok: false; error: string } {
  const s = src.trim();
  if (!s) return { ok: false, error: "the expression is empty." };
  if (s.length > 200) return { ok: false, error: "the expression is too long." };
  let i = 0;
  const peek = () => s[i];
  const skip = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const cols = new Set(columns);

  function factor(): Node {
    skip();
    const c = peek();
    if (c === "(") { i++; const n = expr(); skip(); if (peek() !== ")") throw new Error("expected ')'"); i++; return n; }
    if (c === "-") { i++; return { t: "neg", v: factor() }; }
    if (c === "`") { const j = s.indexOf("`", i + 1); if (j === -1) throw new Error("unterminated column name"); const name = s.slice(i + 1, j); i = j + 1; if (!cols.has(name)) throw new Error(`"${name}" is not a column in the sheet`); return { t: "col", name }; }
    const num = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; return { t: "num", v: Number(num[0]) }; }
    const word = /^[A-Za-z_][A-Za-z0-9_ ]*/.exec(s.slice(i));
    if (word) {
      let w = word[0].trimEnd(); i += word[0].length - (word[0].length - w.length);
      if (w.toUpperCase() === "ROUND") {
        skip(); if (peek() !== "(") throw new Error("ROUND needs parentheses"); i++;
        const v = expr(); skip(); if (peek() !== ",") throw new Error("ROUND needs a second argument"); i++; skip();
        const d = /^\d+/.exec(s.slice(i)); if (!d) throw new Error("ROUND's second argument must be a whole number"); i += d[0].length;
        skip(); if (peek() !== ")") throw new Error("expected ')'"); i++;
        return { t: "round", v, d: Math.min(6, Number(d[0])) };
      }
      /* A bare identifier may be a column name containing spaces; take the longest matching prefix. */
      const candidates = [...cols].filter((c) => (w + s.slice(i)).startsWith(c)).sort((a, b) => b.length - a.length);
      const best = candidates[0];
      if (!best) throw new Error(`"${w}" is not a column in the sheet and not a number`);
      i += best.length - w.length;
      return { t: "col", name: best };
    }
    throw new Error(`unexpected "${c ?? "end of expression"}"`);
  }
  function term(): Node { let n = factor(); for (;;) { skip(); const c = peek(); if (c === "*" || c === "/") { i++; n = { t: "bin", op: c, l: n, r: factor() }; } else return n; } }
  function expr(): Node { let n = term(); for (;;) { skip(); const c = peek(); if (c === "+" || c === "-") { i++; n = { t: "bin", op: c, l: n, r: term() }; } else return n; } }

  try {
    const node = expr(); skip();
    if (i < s.length) return { ok: false, error: `unexpected "${s.slice(i, i + 10)}" in the expression.` };
    return { ok: true, node };
  } catch (e: any) { return { ok: false, error: `${e.message}.` }; }
}

/**
 * A cell as a number, the way an Indian spreadsheet writes one: "1,20,000",
 * "₹ 45,000.50", "Rs. 900", "(1,200)" for a negative, "5,000/-". CSV cells
 * are always text, and Number("1,20,000") is NaN — so a filter "Amount >
 * 50000" silently compared as text and subtotals summed to zero.
 * Returns NaN for anything that is not a number (including dates).
 */
export function toNum(v: Cell | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  let t = v.trim();
  if (!t) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/\/-$/, "").replace(/[,\s]/g, "");
  if (!/^[-+]?\d*\.?\d+$/.test(t)) return NaN;
  const n = Number(t);
  return neg ? -n : n;
}

/** Evaluate against a row (for the preview and for the stored value). */
export function evalExpr(node: Node, row: Row): number | null {
  switch (node.t) {
    case "num": return node.v;
    case "col": { const n = toNum(row[node.name]); return Number.isFinite(n) ? n : null; }
    case "neg": { const v = evalExpr(node.v, row); return v === null ? null : -v; }
    case "round": { const v = evalExpr(node.v, row); return v === null ? null : Number(v.toFixed(node.d)); }
    case "bin": {
      const l = evalExpr(node.l, row), r = evalExpr(node.r, row);
      if (l === null || r === null) return null;
      switch (node.op) { case "+": return l + r; case "-": return l - r; case "*": return l * r; case "/": return r === 0 ? null : l / r; }
    }
  }
}

/** Render the tree as an Excel formula for row `rowNo`, given column → letter. */
export function toFormula(node: Node, colLetter: (name: string) => string, rowNo: number): string {
  switch (node.t) {
    case "num": return String(node.v);
    case "col": return `${colLetter(node.name)}${rowNo}`;
    case "neg": return `-(${toFormula(node.v, colLetter, rowNo)})`;
    case "round": return `ROUND(${toFormula(node.v, colLetter, rowNo)},${node.d})`;
    case "bin": return `(${toFormula(node.l, colLetter, rowNo)}${node.op}${toFormula(node.r, colLetter, rowNo)})`;
  }
}

/* ------------------------------------------------------------------ apply */

export type Diff = {
  rowsBefore: number; rowsAfter: number;
  columnsBefore: string[]; columnsAfter: string[];
  added: string[]; removed: string[]; renamed: Array<{ from: string; to: string }>;
  subtotals: Array<{ group: string; sum: string; groups: number }>;
  sample: Row[];
  /** Columns whose values are formulas in the workbook (so the preview can say so). */
  formulaColumns: Array<{ name: string; expr: string }>;
};

export function applyPlan(table: Table, ops: Op[]): { table: Table; subtotalSheets: Array<{ name: string; columns: string[]; rows: Row[] }>; diff: Diff } {
  let columns = [...table.columns];
  let rows = table.rows.map((r) => ({ ...r }));
  const added: string[] = [], removed: string[] = [], renamed: Array<{ from: string; to: string }> = [];
  const subtotalSheets: Array<{ name: string; columns: string[]; rows: Row[] }> = [];
  const subtotals: Diff["subtotals"] = [];
  const formulaColumns: Diff["formulaColumns"] = [];

  const cmpVal = (a: Cell, b: string | number | undefined, cmp: string): boolean => {
    const blank = a === null || a === undefined || a === "";
    if (cmp === "empty") return blank;
    if (cmp === "not_empty") return !blank;
    if (blank) return false;
    const an = a instanceof Date ? NaN : toNum(a as Cell);
    const bn = typeof b === "number" ? b : toNum(b ?? null);
    const bothNum = Number.isFinite(an) && Number.isFinite(bn) && !(a instanceof Date);
    const as = a instanceof Date ? a.toISOString().slice(0, 10) : String(a).toLowerCase();
    const bs = String(b ?? "").toLowerCase();
    switch (cmp) {
      case "eq": return bothNum ? an === bn : as === bs;
      case "neq": return bothNum ? an !== bn : as !== bs;
      case "gt": return bothNum ? an > bn : as > bs;
      case "gte": return bothNum ? an >= bn : as >= bs;
      case "lt": return bothNum ? an < bn : as < bs;
      case "lte": return bothNum ? an <= bn : as <= bs;
      case "contains": return as.includes(bs);
      case "not_contains": return !as.includes(bs);
    }
    return false;
  };

  for (const op of ops) {
    switch (op.op) {
      case "filter": rows = rows.filter((r) => cmpVal(r[op.column], op.value, op.cmp)); break;
      case "sort": {
        const dir = op.dir === "asc" ? 1 : -1;
        rows.sort((a, b) => {
          const x = a[op.column], y = b[op.column];
          if (x === null || x === undefined || x === "") return 1;
          if (y === null || y === undefined || y === "") return -1;
          const xn = x instanceof Date ? x.getTime() : toNum(x), yn = y instanceof Date ? y.getTime() : toNum(y);
          if (Number.isFinite(xn) && Number.isFinite(yn)) return (xn - yn) * dir;
          return String(x).localeCompare(String(y)) * dir;
        });
        break;
      }
      case "rename": {
        columns = columns.map((c) => (c === op.from ? op.to : c));
        rows = rows.map((r) => { const { [op.from]: v, ...rest } = r; return { ...rest, [op.to]: v }; });
        renamed.push({ from: op.from, to: op.to });
        break;
      }
      case "keep_columns": {
        const drop = columns.filter((c) => !op.columns.includes(c));
        columns = columns.filter((c) => op.columns.includes(c));
        rows = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));
        removed.push(...drop); break;
      }
      case "drop_columns": {
        columns = columns.filter((c) => !op.columns.includes(c));
        rows = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));
        removed.push(...op.columns); break;
      }
      case "dedupe": {
        const keyCols = op.columns && op.columns.length ? op.columns : columns;
        const seen = new Set<string>();
        rows = rows.filter((r) => { const k = JSON.stringify(keyCols.map((c) => norm(r[c]))); if (seen.has(k)) return false; seen.add(k); return true; });
        break;
      }
      case "remove_empty_rows": rows = rows.filter((r) => columns.some((c) => r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== "")); break;
      case "trim_whitespace": rows = rows.map((r) => Object.fromEntries(columns.map((c) => [c, typeof r[c] === "string" ? (r[c] as string).trim() : r[c]]))); break;
      case "uppercase": rows = rows.map((r) => ({ ...r, [op.column]: typeof r[op.column] === "string" ? (r[op.column] as string).toUpperCase() : r[op.column] })); break;
      case "titlecase": rows = rows.map((r) => ({ ...r, [op.column]: typeof r[op.column] === "string" ? (r[op.column] as string).toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : r[op.column] })); break;
      case "add_column": {
        const parsed = parseExpr(op.expr, columns);
        if (!parsed.ok) break; // validatePlan already refused this; defensive
        rows = rows.map((r) => ({ ...r, [op.name]: evalExpr(parsed.node, r) }));
        columns = [...columns, op.name]; added.push(op.name);
        formulaColumns.push({ name: op.name, expr: op.expr });
        break;
      }
      case "subtotal": {
        const groups = new Map<string, number>();
        for (const r of rows) { const g = String(r[op.group_by] ?? "(blank)"); const v = toNum(r[op.sum]); groups.set(g, (groups.get(g) || 0) + (Number.isFinite(v) ? v : 0)); }
        const srows = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([g, v]) => ({ [op.group_by]: g, [`Total ${op.sum}`]: v }));
        subtotalSheets.push({ name: "Subtotals", columns: [op.group_by, `Total ${op.sum}`], rows: srows });
        subtotals.push({ group: op.group_by, sum: op.sum, groups: groups.size });
        break;
      }
    }
  }

  return {
    table: { columns, rows },
    subtotalSheets,
    diff: {
      rowsBefore: table.rows.length, rowsAfter: rows.length,
      columnsBefore: table.columns, columnsAfter: columns,
      added, removed, renamed, subtotals,
      sample: rows.slice(0, 8),
      formulaColumns,
    },
  };
}

function norm(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim().toLowerCase();
}

/** Column index → Excel letters (0 → A, 25 → Z, 26 → AA). */
export function colLetterFor(index: number): string {
  let s = "", n = index;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/** Summary the model is given — shape only, a few rows, never the whole sheet. */
export function summarise(table: Table): string {
  const types = table.columns.map((c) => {
    const vals = table.rows.slice(0, 50).map((r) => r[c]).filter((v) => v !== null && v !== undefined && v !== "");
    const nums = vals.filter((v) => typeof v === "number" || (typeof v === "string" && Number.isFinite(toNum(v)))).length;
    const dates = vals.filter((v) => v instanceof Date).length;
    const t = vals.length === 0 ? "empty" : dates > vals.length / 2 ? "date" : nums > vals.length / 2 ? "number" : "text";
    return `${c} (${t})`;
  });
  const sample = table.rows.slice(0, 3).map((r) => table.columns.map((c) => { const v = r[c]; return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 40); }).join(" | "));
  return `Columns: ${types.join(", ")}\nRows: ${table.rows.length}\nFirst rows:\n${sample.join("\n")}`;
}
