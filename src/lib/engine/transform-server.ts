import "server-only";
import ExcelJS from "exceljs";
import { geminiTextModels } from "@/lib/ai/models";
import { aiKey } from "@/lib/ai/byo";
import { generationConfig, FAST } from "@/lib/ai/generation";
import { groqModel } from "@/lib/ai/model-defaults";
import {
  type Table, type Row, type Cell, type Op, validatePlan, applyPlan, parseExpr, toFormula, colLetterFor, summarise,
  MAX_ROWS, MAX_COLUMNS, OP_NAMES,
} from "./transform";

/*
  The server half of workbook transforms: read the upload, ask the model for a
  plan, write the result. The pure half (validate, apply, the expression
  grammar) is in transform.ts and is what the test suite executes.
*/

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/* ---------------------------------------------------------------- parse */

export async function parseUpload(buffer: Buffer, filename: string): Promise<{ ok: true; table: Table; sheetName: string } | { ok: false; error: string }> {
  if (buffer.length > MAX_UPLOAD_BYTES) return { ok: false, error: `That file is ${(buffer.length / 1_048_576).toFixed(1)} MB; the limit is 5 MB.` };
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith(".csv")) {
      const { parseCsvGrid } = await import("@/lib/csv");
      const grid = parseCsvGrid(buffer.toString("utf8"));
      return gridToTable(grid, "Sheet1");
    }
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) return { ok: false, error: "Upload a .xlsx or .csv file." };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets.find((w) => w.rowCount > 0) || wb.worksheets[0];
    if (!ws) return { ok: false, error: "The workbook has no sheets." };
    const grid: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: Cell[] = [];
      const vals = row.values as any[];
      for (let c = 1; c < Math.min(vals.length, MAX_COLUMNS + 1); c++) cells.push(cellValue(vals[c]));
      grid.push(cells);
      if (grid.length > MAX_ROWS + 1) return;
    });
    return gridToTable(grid, ws.name);
  } catch (e: any) {
    return { ok: false, error: `Could not read the file: ${e?.message || "unknown error"}` };
  }
}

function cellValue(v: any): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result);          // a formula cell: take its cached result
    if ("richText" in v) return (v.richText as any[]).map((p) => p.text).join("");
    if ("text" in v) return String(v.text);                 // hyperlink
    return String(v);
  }
  return v as Cell;
}

function gridToTable(grid: Cell[][], sheetName: string): { ok: true; table: Table; sheetName: string } | { ok: false; error: string } {
  if (grid.length < 2) return { ok: false, error: "The sheet needs a header row and at least one data row." };
  const header = grid[0].map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
  /* De-duplicate header names so they can be used as keys. */
  const seen = new Map<string, number>();
  const columns = header.map((h) => { const n = (seen.get(h) || 0) + 1; seen.set(h, n); return n === 1 ? h : `${h} (${n})`; });
  if (columns.length > MAX_COLUMNS) return { ok: false, error: `Too many columns (${columns.length}); the limit is ${MAX_COLUMNS}.` };
  const body = grid.slice(1, MAX_ROWS + 1);
  const rows: Row[] = body.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null])));
  if (grid.length - 1 > MAX_ROWS) return { ok: false, error: `The sheet has ${grid.length - 1} rows; the limit is ${MAX_ROWS}.` };
  return { ok: true, table: { columns, rows }, sheetName };
}

/* ----------------------------------------------------------------- plan */

const SYS = `You translate a plain-English request about a spreadsheet into a JSON plan.
Return ONLY a JSON object: {"plan": [ ...operations ], "note": "<one sentence, or empty>"}.
Operations (use ONLY these, with these exact fields):
  {"op":"filter","column":C,"cmp":"eq|neq|gt|gte|lt|lte|contains|not_contains|empty|not_empty","value":V}
  {"op":"sort","column":C,"dir":"asc|desc"}
  {"op":"rename","from":C,"to":"New name"}
  {"op":"keep_columns","columns":[C,...]}   {"op":"drop_columns","columns":[C,...]}
  {"op":"dedupe","columns":[C,...]}         {"op":"remove_empty_rows"}
  {"op":"add_column","name":"New","expr":"<arithmetic over column names and numbers, e.g. Amount * 0.18 or ROUND(Qty * Rate, 2)>"}
  {"op":"subtotal","group_by":C,"sum":C}
  {"op":"trim_whitespace"}  {"op":"uppercase","column":C}  {"op":"titlecase","column":C}
Rules: C must be a column name EXACTLY as listed. expr may contain only column names, numbers, + - * / ( ) and ROUND(x, n) — no other functions, no quotes, no text.
If the request cannot be done with these operations, return {"plan": [], "note": "<why, briefly>"}. Never invent columns.`;

export type PlanResult =
  | { ok: true; ops: Op[]; describe: string[]; note: string }
  | { ok: false; error: string; problems?: string[]; note?: string };

export async function planWithModel(table: Table, instruction: string): Promise<PlanResult> {
  const prompt = `SPREADSHEET\n${summarise(table)}\n\nREQUEST\n${instruction.slice(0, 600)}`;
  const raw = await askJson(prompt);
  if (!raw) return { ok: false, error: "Cortex could not plan that right now — the AI provider did not answer. Try again in a moment." };
  const plan = (raw as any)?.plan;
  const note = String((raw as any)?.note || "").slice(0, 300);
  if (!Array.isArray(plan) || plan.length === 0) {
    return { ok: false, error: note || "Cortex could not turn that into steps it knows how to do.", note, problems: [`Supported: ${OP_NAMES.join(", ")}.`] };
  }
  const v = validatePlan(plan, table.columns);
  if (!v.ok) return { ok: false, error: "Cortex planned something it is not allowed to do, so nothing was changed.", problems: v.problems, note };
  return { ok: true, ops: v.ops, describe: v.describe, note };
}

async function askJson(prompt: string): Promise<unknown | null> {
  const gkey = aiKey("GEMINI_API_KEY");
  if (gkey) {
    try {
      const model = geminiTextModels()[0];
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(gkey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYS }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: generationConfig(FAST, { temperature: 0.1, responseMimeType: "application/json" }),
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) { const j = await r.json(); const t = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(""); const p = safeJson(t); if (p) return p; }
    } catch { /* fall through */ }
  }
  const qkey = aiKey("GROQ_API_KEY");
  if (qkey) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${qkey}` },
        body: JSON.stringify({ model: groqModel(), messages: [{ role: "system", content: SYS }, { role: "user", content: prompt }], temperature: 0.1, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) { const j = await r.json(); const p = safeJson(j?.choices?.[0]?.message?.content || ""); if (p) return p; }
    } catch { /* fall through */ }
  }
  return null;
}

function safeJson(t: string): unknown | null {
  const s = String(t || "").trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch { return null; }
}

/* ---------------------------------------------------------------- write */

const INR = '#,##0.00;[Red]-#,##0.00';
const safeText = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };

/**
 * Write the transformed table. add_column values are written as FORMULAS
 * generated from the parsed expression (never from model text), so the
 * person gets a live spreadsheet, not a snapshot. Everything else is a value.
 */
export async function buildTransformed(
  original: Table, ops: Op[], sheetName: string, sourceFilename: string,
): Promise<{ buffer: Buffer; filename: string; diff: ReturnType<typeof applyPlan>["diff"] }> {
  const { table, subtotalSheets, diff } = applyPlan(original, ops);
  const wb = new ExcelJS.Workbook();
  wb.creator = "MNB Cortex";

  const ws = wb.addWorksheet(sheetName.slice(0, 31) || "Sheet1");
  ws.columns = table.columns.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };

  const letter = (name: string) => colLetterFor(table.columns.indexOf(name));
  const formulaCols = ops.filter((o): o is Extract<Op, { op: "add_column" }> => o.op === "add_column")
    .map((o) => ({ name: o.name, node: parseExpr(o.expr, table.columns) }))
    .filter((f) => f.node.ok) as Array<{ name: string; node: { ok: true; node: any } }>;

  table.rows.forEach((r, i) => {
    const rowNo = i + 2;
    const values: Record<string, Cell> = {};
    for (const c of table.columns) {
      const v = r[c];
      values[c] = typeof v === "string" ? safeText(v) : v;
    }
    ws.addRow(values);
    for (const f of formulaCols) {
      const cell = ws.getCell(`${letter(f.name)}${rowNo}`);
      cell.value = { formula: toFormula(f.node.node, letter, rowNo), result: (r[f.name] as number | null) ?? undefined } as any;
      cell.numFmt = INR;
    }
  });

  for (const st of subtotalSheets) {
    const sws = wb.addWorksheet(st.name);
    sws.columns = st.columns.map((c) => ({ header: c, key: c, width: 24 }));
    sws.getRow(1).font = { bold: true };
    st.rows.forEach((r) => sws.addRow(Object.fromEntries(st.columns.map((c) => [c, typeof r[c] === "string" ? safeText(r[c]) : r[c]]))));
    const n = st.rows.length + 2;
    sws.getCell(`A${n}`).value = "Total"; sws.getCell(`A${n}`).font = { bold: true };
    sws.getCell(`B${n}`).value = { formula: st.rows.length ? `SUM(B2:B${n - 1})` : "0", result: undefined as any }; sws.getCell(`B${n}`).numFmt = INR; sws.getCell(`B${n}`).font = { bold: true };
  }

  const about = wb.addWorksheet("Cortex");
  about.getColumn(1).width = 100;
  about.getCell("A1").value = "Transformed by MNB Cortex"; about.getCell("A1").font = { bold: true, size: 14 };
  about.getCell("A2").value = `Source: ${safeText(sourceFilename)} · ${new Date().toLocaleString("en-IN")}`;
  about.getCell("A4").value = "Steps applied:"; about.getCell("A4").font = { bold: true };
  const v = validatePlan(ops, original.columns);
  (v.ok ? v.describe : []).forEach((d, i) => { about.getCell(`A${5 + i}`).value = `${i + 1}. ${d}`; });
  about.getCell(`A${7 + ops.length}`).value = `Rows: ${diff.rowsBefore} → ${diff.rowsAfter}. Columns: ${diff.columnsBefore.length} → ${diff.columnsAfter.length}.`;

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const base = sourceFilename.replace(/\.(xlsx|xlsm|csv)$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "workbook";
  return { buffer, filename: `${base}-cortex.xlsx`, diff };
}
