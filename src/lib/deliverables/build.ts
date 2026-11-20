import "server-only";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import PptxGenJS from "pptxgenjs";
import ExcelJS from "exceljs";
import { type VerificationLike } from "@/lib/deliverables/blocks";
import { parseBlocks, inlineRuns, plain, toSlides, veritasLine, type Block } from "@/lib/deliverables/blocks";
export { veritasLine };

/*
  DELIVERABLES — turn an agent task into a Word document, a PowerPoint deck or
  an Excel workbook, with its evidence attached.

  Every format carries the same three things, because a deliverable that cannot
  be defended is a liability:
    1. the result, as the agents wrote it;
    2. the Veritas v1 line (how many rupee figures were checked, which were
       not supported) — never dropped, never reworded into "verified";
    3. the work log: which agent did which step.
  Styling is the MNB Cortex brand: near-black, one gold accent.
*/

export type DeliverableInput = {
  title: string; request: string; date: string; workspace: string;
  result: string;
  verification: VerificationLike;
  steps: { agent: string; instruction: string; output: string }[];
};

const GOLD = "C9A24A", INK = "111114", MUTED = "6B6B74";

/* ------------------------------------------------------------------ Word */

const runs = (s: string, extra: { color?: string; size?: number } = {}) => inlineRuns(s).map((r) => new TextRun({ text: r.text, bold: r.bold, ...extra }));

function docxBlocks(blocks: Block[]) {
  const out: (Paragraph | Table)[] = [];
  for (const b of blocks) {
    if (b.type === "heading") out.push(new Paragraph({ heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: runs(b.text, { color: INK }) }));
    else if (b.type === "paragraph") out.push(new Paragraph({ children: runs(b.text), spacing: { after: 120 } }));
    else if (b.type === "bullets") b.items.forEach((it, i) => out.push(new Paragraph({ children: b.ordered ? [new TextRun(`${i + 1}. `), ...runs(it)] : runs(it), bullet: b.ordered ? undefined : { level: 0 }, spacing: { after: 60 } })));
    else if (b.type === "table") {
      const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9DE" };
      const mk = (cells: string[], head: boolean) => new TableRow({ tableHeader: head, children: cells.map((c) => new TableCell({ borders: { top: border, bottom: border, left: border, right: border }, shading: head ? { fill: "F3F0E8" } : undefined, children: [new Paragraph({ children: runs(c).map((r) => r), spacing: { after: 40 } })] })) });
      out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [mk(b.header, true), ...b.rows.map((r) => mk(r, false))] }));
      out.push(new Paragraph({ text: "" }));
    }
  }
  return out;
}

export async function toDocx(d: DeliverableInput): Promise<Buffer> {
  const doc = new Document({
    creator: "MNB Cortex", title: d.title, description: d.request,
    styles: { default: { document: { run: { font: "Calibri", size: 22, color: INK } } } },
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: "MNB CORTEX", bold: true, color: GOLD, size: 18 })] }),
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: d.title, bold: true, color: INK })] }),
        new Paragraph({ children: [new TextRun({ text: `${d.workspace} · ${d.date}`, color: MUTED, size: 18 })], spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Request: ", bold: true }), new TextRun(d.request)], spacing: { after: 240 } }),
        ...docxBlocks(parseBlocks(d.result)),
        new Paragraph({ children: [new TextRun({ text: veritasLine(d.verification), italics: true, color: MUTED, size: 18 })], spacing: { before: 240, after: 240 } }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Work log", color: INK })] }),
        ...d.steps.flatMap((s) => [
          new Paragraph({ children: [new TextRun({ text: s.agent, bold: true }), new TextRun({ text: ` — ${s.instruction}`, color: MUTED })], spacing: { before: 120 } }),
          new Paragraph({ children: [new TextRun({ text: plain(s.output).slice(0, 1500), size: 18 })] }),
        ]),
        new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: "Prepared by MNB Cortex agents. Figures come from the workspace's own data; check anything flagged above before relying on it.", color: MUTED, size: 16 })], spacing: { before: 360 } }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

/* ------------------------------------------------------------ PowerPoint */

export async function toPptx(d: DeliverableInput): Promise<Buffer> {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.author = "MNB Cortex"; p.title = d.title;
  const bg = { color: "0B0B0C" }, fg = "EDEDEF", mute = "9A9AA4";

  const cover = p.addSlide(); cover.background = bg;
  cover.addText("MNB CORTEX", { x: 0.6, y: 0.5, w: 6, h: 0.4, fontSize: 12, bold: true, color: GOLD, charSpacing: 4 });
  cover.addText(d.title, { x: 0.6, y: 2.2, w: 12, h: 1.6, fontSize: 40, bold: true, color: fg, fontFace: "Calibri" });
  cover.addText(d.request, { x: 0.6, y: 3.9, w: 12, h: 1, fontSize: 16, color: mute });
  cover.addText(`${d.workspace} · ${d.date}`, { x: 0.6, y: 6.6, w: 8, h: 0.4, fontSize: 12, color: mute });

  for (const s of toSlides(parseBlocks(d.result))) {
    const sl = p.addSlide(); sl.background = bg;
    sl.addShape(p.ShapeType.rect, { x: 0.6, y: 0.55, w: 0.08, h: 0.5, fill: { color: GOLD } });
    sl.addText(s.title, { x: 0.85, y: 0.45, w: 11.8, h: 0.7, fontSize: 26, bold: true, color: fg });
    if (s.table) {
      const rows = [s.table.header.map((h) => ({ text: h, options: { bold: true, color: INK, fill: { color: GOLD } } })), ...s.table.rows.map((r) => r.map((c) => ({ text: c, options: { color: fg } })))];
      sl.addTable(rows as any, { x: 0.6, y: 1.45, w: 12.1, fontSize: 12, border: { type: "solid", pt: 0.5, color: "333338" }, autoPage: false });
    } else {
      sl.addText(s.lines.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.85, y: 1.45, w: 11.8, h: 5.3, fontSize: 16, color: fg, valign: "top", paraSpaceAfter: 8 });
    }
  }

  const ev = p.addSlide(); ev.background = bg;
  ev.addText("How this was produced", { x: 0.6, y: 0.45, w: 12, h: 0.7, fontSize: 26, bold: true, color: fg });
  ev.addText([
    { text: veritasLine(d.verification), options: { breakLine: true, color: GOLD } },
    ...d.steps.slice(0, 8).map((s) => ({ text: `${s.agent} — ${s.instruction}`.slice(0, 180), options: { bullet: true, breakLine: true, color: fg } })),
  ], { x: 0.6, y: 1.45, w: 12, h: 5.3, fontSize: 14, valign: "top", paraSpaceAfter: 6 });

  const out = await p.write({ outputType: "nodebuffer" });
  return out as Buffer;
}

/* ----------------------------------------------------------------- Excel */

export async function toXlsx(d: DeliverableInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); wb.creator = "MNB Cortex";
  const blocks = parseBlocks(d.result);
  const sum = wb.addWorksheet("Summary");
  sum.addRow(["MNB Cortex"]).font = { bold: true, color: { argb: "FF" + GOLD } };
  sum.addRow([d.title]).font = { bold: true, size: 16 };
  sum.addRow([`${d.workspace} · ${d.date}`]);
  sum.addRow(["Request", d.request]);
  sum.addRow([]);
  for (const b of blocks) {
    if (b.type === "heading") sum.addRow([plain(b.text)]).font = { bold: true };
    else if (b.type === "paragraph") sum.addRow([plain(b.text)]);
    else if (b.type === "bullets") b.items.forEach((it) => sum.addRow([`• ${plain(it)}`]));
    else if (b.type === "table") sum.addRow([`(table: see sheet "${b.header[0] || "Table"}")`]);
  }
  sum.addRow([]); sum.addRow([veritasLine(d.verification)]).font = { italic: true };
  sum.getColumn(1).width = 110; sum.getColumn(1).alignment = { wrapText: true, vertical: "top" }; sum.getColumn(2).width = 60;

  /* Every table in the result becomes its own sheet; numbers stay numbers. */
  blocks.filter((b): b is Extract<Block, { type: "table" }> => b.type === "table").forEach((t, i) => {
    const ws = wb.addWorksheet(`Table ${i + 1}`.slice(0, 31));
    ws.addRow(t.header.map(plain)).font = { bold: true };
    for (const r of t.rows) ws.addRow(r.map((c) => { const v = plain(c).replace(/[₹,\s]/g, ""); return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : plain(c); }));
    ws.columns.forEach((c) => { c.width = 22; });
  });

  const log = wb.addWorksheet("Work log");
  log.addRow(["Agent", "Instruction", "Output"]).font = { bold: true };
  for (const s of d.steps) log.addRow([s.agent, s.instruction, plain(s.output).slice(0, 30000)]);
  log.columns.forEach((c, i) => { c.width = [24, 50, 100][i]; c.alignment = { wrapText: true, vertical: "top" }; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
