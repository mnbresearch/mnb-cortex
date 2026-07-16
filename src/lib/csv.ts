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

// Turn a Google Sheets share/edit URL into a CSV export URL
export function toCsvUrl(url: string): string {
  const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) {
    const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1] || "0";
    return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
  }
  return url;
}
