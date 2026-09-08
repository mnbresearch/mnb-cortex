/**
 * The raw grid, before anything assumes row 0 is the header.
 *
 * parseCsv() below takes row 0 as the header and returns objects, which is
 * right for a clean spreadsheet and wrong for a Tally or Vyapar export, where
 * row 0 is the company name. lib/accounting-export.ts needs to see the rows as
 * written so it can find the real header, so the tokenising is shared and only
 * the interpretation differs.
 */
export function parseCsvGrid(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

export function parseCsv(text: string): any[] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/*
  Turn a Google Sheets URL into a CSV export URL.

  TWO SHAPES, AND THE SECOND ONE BROKE.

  An edit/share URL is   /spreadsheets/d/<44-char-id>/edit
  A PUBLISHED url is     /spreadsheets/d/e/2PACX-1vR…/pub?output=csv

  The old pattern matched `/spreadsheets/d/([A-Za-z0-9_-]+)` against both, so
  on a published link it captured the literal segment "e" and built
  `/spreadsheets/d/e/export?format=csv` — a URL for a document that does not
  exist. Google answers 400, and the customer is told to "make sure the sheet is
  public", which it already is. File > Share > Publish to the web is the option
  people actually use, so this was the more common of the two.

  A published URL is ALREADY a CSV endpoint when it carries output=csv, so the
  right move is to leave it alone rather than rebuild it.
*/
export function toCsvUrl(url: string): string {
  // Already a published CSV (or any /d/e/… published link) — do not rewrite it.
  if (/docs\.google\.com\/spreadsheets\/d\/e\//.test(url)) {
    return /[?&]output=csv/.test(url) ? url : url.replace(/\/pub(html)?(\?|$)/, "/pub?output=csv&");
  }
  const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m && m[1] !== "e") {
    const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1] || "0";
    return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
  }
  return url;
}
