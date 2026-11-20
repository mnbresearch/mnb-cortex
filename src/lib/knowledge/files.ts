import "server-only";
import { toPlainText } from "@/lib/knowledge/core";

/*
  Text out of a file, for Company Knowledge.

  PDF (unpdf), Word .docx (mammoth), and the text formats read as text:
  txt, md, csv, tsv, json, html, eml. Excel .xlsx workbooks go through ExcelJS,
  already a dependency, one sheet at a time as CSV.
  Anything else is refused by name rather than stored as garbage — an owner
  who uploads a .pptx is told it was skipped, never shown a hit that is
  binary noise.
*/

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "log", "eml", "htm", "html", "xml"]);

export function extOf(name: string): string {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : "";
}

export function canExtract(name: string, mime = ""): boolean {
  const e = extOf(name);
  return e === "pdf" || e === "docx" || e === "xlsx" || TEXT_EXT.has(e) || /^text\//.test(mime) || mime === "application/pdf";
}

export async function extractText(name: string, bytes: Uint8Array, mime = ""): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: `${name} is over 15 MB.` };
  const e = extOf(name);
  try {
    if (e === "pdf" || mime === "application/pdf") {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const { text } = await pdfText(pdf, { mergePages: true });
      const t = String(Array.isArray(text) ? text.join("\n\n") : text || "").trim();
      return t ? { ok: true, text: t } : { ok: false, error: `${name} has no readable text (it may be a scan).` };
    }
    if (e === "docx") {
      const mammoth = await import("mammoth");
      const r = await (mammoth as any).extractRawText({ buffer: Buffer.from(bytes) });
      return { ok: true, text: String(r?.value || "").trim() };
    }
    if (e === "xlsx") {
      const ExcelJS = (await import("exceljs")).default as any;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(bytes));
      const parts: string[] = [];
      wb.eachSheet((ws: any) => {
        if (parts.length >= 20) return;
        const lines: string[] = [];
        ws.eachRow({ includeEmpty: false }, (row: any) => {
          if (lines.length >= 5000) return;
          const vals = (row.values as any[]).slice(1).map((v) => {
            const x = v && typeof v === "object" ? (v.result ?? v.text ?? (v.richText ? v.richText.map((r: any) => r.text).join("") : "")) : v;
            const s = x === null || x === undefined ? "" : String(x);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          });
          lines.push(vals.join(","));
        });
        parts.push(`## ${ws.name}\n${lines.join("\n")}`);
      });
      return { ok: true, text: parts.join("\n\n") };
    }
    if (TEXT_EXT.has(e) || /^text\//.test(mime)) {
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      return { ok: true, text: e === "html" || e === "htm" || e === "eml" ? toPlainText(raw) : raw };
    }
    return { ok: false, error: `${name}: this file type is not read yet (PDF, Word, Excel, CSV and text files are).` };
  } catch (err: any) {
    return { ok: false, error: `${name} could not be read: ${String(err?.message || err).slice(0, 160)}` };
  }
}
