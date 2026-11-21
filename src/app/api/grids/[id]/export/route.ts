import ExcelJS from "exceljs";
import { getUserAndOrg } from "@/lib/data";
import { getGrid } from "@/lib/grids/store";
import { cellKey } from "@/lib/grids/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Grid → .xlsx. Sheet 1 is the grid as you see it; sheet 2 lists every cell
  with its verbatim quote and whether Cortex found that quote in the document,
  so the workbook can be defended cell by cell.
*/
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return new Response("Sign in to a workspace.", { status: 401 });
  const g = await getGrid(orgId, params.id);
  if (!g) return new Response("Grid not found.", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "MNB Cortex";
  const ws = wb.addWorksheet("Grid");
  ws.addRow(["Document", "Source", ...g.columns.map((c) => c.question)]).font = { bold: true };
  for (const r of g.rows) {
    ws.addRow([r.title, r.citation, ...g.columns.map((c) => { const x = g.cells[cellKey(r.id, c.id)]; return x ? (x.status === "done" && !x.verified ? `${x.answer} (quote not verified)` : x.answer) : ""; })]);
  }
  ws.columns.forEach((col, i) => { col.width = i === 0 ? 36 : i === 1 ? 44 : 32; col.alignment = { wrapText: true, vertical: "top" }; });
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  const ev = wb.addWorksheet("Evidence");
  ev.addRow(["Document", "Question", "Answer", "Quote from the document", "Quote found in document", "Source", "Link"]).font = { bold: true };
  for (const r of g.rows) for (const c of g.columns) {
    const x = g.cells[cellKey(r.id, c.id)];
    if (!x) continue;
    ev.addRow([r.title, c.question, x.answer, x.quote, x.status === "done" ? (x.verified ? "Yes" : "No") : "—", r.citation, r.url || ""]);
  }
  ev.columns.forEach((col, i) => { col.width = [32, 36, 32, 60, 14, 44, 30][i] || 20; col.alignment = { wrapText: true, vertical: "top" }; });

  const buf = await wb.xlsx.writeBuffer();
  const safe = g.name.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "grid";
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${safe}.xlsx"` } });
}
