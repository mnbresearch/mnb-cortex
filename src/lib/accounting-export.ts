/**
 * Recognise and flatten the export files Indian accounting packages produce.
 *
 * THE PROBLEM THIS SOLVES, WHICH IS NOT THE SAME AS THE COLUMN-NAME PROBLEM.
 *
 * `lib/import-map.ts` matches a customer's HEADER NAMES to Cortex's columns, so
 * "Voucher No." finds `order_no`. That is necessary and not sufficient, because
 * these tools do not emit a clean rectangle in the first place:
 *
 *   - Tally's Day Book and Ledger exports carry several TITLE ROWS before the
 *     header ("Sharma Steel Pvt Ltd", "Day Book", "1-Apr-2026 to 30-Apr-2026"),
 *     so row 0 is the company name, not the header.
 *   - Tally splits value across `Debit` and `Credit` columns; neither alone is
 *     the amount, and which one applies depends on the voucher type.
 *   - Tally ledger exports repeat the party only on the FIRST line of a voucher
 *     and leave it blank on continuation lines.
 *   - Most of them end with a TOTAL row that is not a transaction, and importing
 *     it adds a phantom order worth the sum of all the others.
 *   - Dates arrive as `1-Apr-2026`, which `new Date()` misreads or rejects.
 *
 * Feed such a file to a plain CSV importer and the best case is garbage; the
 * likely case is a "successful" import whose totals are double the truth
 * because the TOTAL row came in as a transaction.
 *
 * DELIBERATELY PURE — no imports, no DB. The import screen previews with it,
 * the server re-runs it, and the test exercises the real thing.
 */

export type Detected = {
  /** Which tool the file looks like it came from. */
  source: "tally" | "vyapar" | "busy" | "generic";
  /** Zero-based index of the row that holds the real column headers. */
  headerRow: number;
  /** Rows above the header that were skipped (titles, date ranges). */
  skippedTitles: string[];
  /** Trailing rows dropped because they are totals, not transactions. */
  droppedTotals: number;
  /** Human-readable note for the UI. */
  note: string;
};

export type FlattenResult = Detected & { rows: Record<string, string>[] };

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header-ish tokens that indicate a row is the real header rather than a title. */
const HEADER_TOKENS = [
  "date", "particulars", "vouchertype", "voucherno", "debit", "credit",
  "invoiceno", "invoicenumber", "partyname", "customer", "amount", "total",
  "itemname", "quantity", "qty", "rate", "orderno", "narration", "gstin",
];

/**
 * Find the row that is actually the header.
 *
 * Scored rather than pattern-matched: the header is the row in the first
 * fifteen with the most header-ish tokens AND at least two non-empty cells.
 * Title rows score zero because "Day Book" is not a column name; a date-range
 * row scores zero for the same reason.
 */
export function findHeaderRow(grid: string[][]): number {
  let best = 0, bestScore = 0;
  const limit = Math.min(grid.length, 15);
  for (let i = 0; i < limit; i++) {
    const cells = (grid[i] || []).map(norm).filter(Boolean);
    if (cells.length < 2) continue;
    const score = cells.filter((c) => HEADER_TOKENS.some((t) => c === t || c.includes(t))).length;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore > 0 ? best : 0;
}

/** Detect which package produced the file, from its title rows and headers. */
export function detectSource(grid: string[][], headerRow: number): Detected["source"] {
  const top = grid.slice(0, headerRow + 1).flat().map(norm).join(" ");
  const hdr = (grid[headerRow] || []).map(norm);

  if (top.includes("daybook") || top.includes("tally") || (hdr.includes("particulars") && hdr.includes("vouchertype"))) return "tally";
  if (top.includes("vyapar") || (hdr.includes("partyname") && hdr.includes("invoicenumber"))) return "vyapar";
  if (top.includes("busy") && hdr.length > 2) return "busy";
  // Debit + Credit with Particulars is Tally's shape even without a title row.
  if (hdr.includes("particulars") && hdr.includes("debit") && hdr.includes("credit")) return "tally";
  return "generic";
}

/** A row that is a total/summary line rather than a transaction. */
function isTotalRow(row: Record<string, string>): boolean {
  const vals = Object.values(row).map((v) => String(v ?? "").trim());
  const nonEmpty = vals.filter(Boolean);
  if (!nonEmpty.length) return true;                       // blank row
  /*
    A total row has a "total"-ish label and almost nothing else filled in.
    Requiring BOTH matters: a legitimate customer called "Total Solutions Pvt
    Ltd" has a party, a date and a voucher number, so it is not dropped.
  */
  const looksTotal = nonEmpty.some((v) => /^(grand\s+)?total\b/i.test(v) || /^closing balance$/i.test(v));
  return looksTotal && nonEmpty.length <= 3;
}

/**
 * Tally writes the party once per voucher and leaves continuation lines blank.
 * Carrying it down turns those lines into complete rows instead of orphans.
 */
function fillDown(rows: Record<string, string>[], keys: string[]): void {
  const last: Record<string, string> = {};
  for (const r of rows) {
    for (const k of keys) {
      const v = String(r[k] ?? "").trim();
      if (v) last[k] = v;
      else if (last[k]) r[k] = last[k];
    }
  }
}

/**
 * Parse `1-Apr-2026`, `01/04/2026`, `2026-04-01` to an ISO date.
 *
 * Day-first is assumed for the slash form, because these are Indian exports and
 * `01/04/2026` there means 1 April, not 4 January. Getting this backwards
 * silently shifts a quarter of every year's rows into the wrong month, which is
 * the kind of error nobody spots until a comparison looks wrong.
 */
export function parseIndianDate(v: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  let m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (m) {
    const mm = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mm) return null;
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${mm}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Strip ₹, commas and (brackets) to a plain number string. Returns "" if not numeric. */
export function parseAmount(v: string): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const neg = /^\(.*\)$/.test(s) || /(^|\s)(cr|dr)$/i.test(s) === false && s.startsWith("-");
  const cleaned = s.replace(/[₹,\s]/g, "").replace(/[()]/g, "").replace(/(cr|dr)$/i, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return "";
  const n = Math.abs(Number(cleaned));
  if (!Number.isFinite(n)) return "";
  return String(neg ? -n : n);
}

/**
 * Turn a raw parsed grid into clean rows, ready for the header matcher.
 *
 * `grid` is the CSV as arrays of strings — the importer's parseCsv output
 * before it assumes row 0 is the header.
 */
export function flattenExport(grid: string[][]): FlattenResult {
  if (!grid.length) {
    return { rows: [], source: "generic", headerRow: 0, skippedTitles: [], droppedTotals: 0, note: "Empty file." };
  }

  const headerRow = findHeaderRow(grid);
  const source = detectSource(grid, headerRow);
  const skippedTitles = grid.slice(0, headerRow)
    .map((r) => r.filter(Boolean).join(" ").trim()).filter(Boolean);

  const headers = (grid[headerRow] || []).map((h) => String(h ?? "").trim());
  let rows: Record<string, string>[] = grid.slice(headerRow + 1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) o[h] = String(r[i] ?? "").trim(); });
    return o;
  });

  /*
    ORDER MATTERS HERE, and getting it wrong is how a customer's revenue doubles.

    The first version filled continuation lines down BEFORE dropping totals. So
    the "Grand Total" row inherited a party name from the row above it, stopped
    looking like a total, and was imported as a fourth transaction worth the sum
    of the other three. The blank separator row was resurrected the same way.
    Result: five rows instead of three and a total of ₹4.55L against a real
    ₹2.5L — reported as a successful import.

    So: drop the blanks and totals FIRST, against the file as written, and only
    then carry values down into the continuation lines that remain.
  */
  const before = rows.length;
  rows = rows.filter((r) => !isTotalRow(r));
  const droppedTotals = before - rows.length;

  // Tally continuation lines: carry the party and date down.
  if (source === "tally") {
    const carry = headers.filter((h) => /particular|party|date|voucher/i.test(h));
    fillDown(rows, carry);
  }

  /*
    Tally's Debit/Credit pair collapsed into one Amount column.

    Neither column alone is "the amount" — a sales voucher puts the value in
    one and a receipt in the other — so a plain importer reading only `Debit`
    silently zeroes half the file. Whichever side carries a number becomes
    Amount, and the original columns are kept so nothing is lost.
  */
  const hasDr = headers.some((h) => /^debit$/i.test(h));
  const hasCr = headers.some((h) => /^credit$/i.test(h));
  if (hasDr && hasCr && !headers.some((h) => /^amount$/i.test(h))) {
    const dr = headers.find((h) => /^debit$/i.test(h))!;
    const cr = headers.find((h) => /^credit$/i.test(h))!;
    for (const r of rows) {
      const d = parseAmount(r[dr]);
      const c = parseAmount(r[cr]);
      r["Amount"] = d && Number(d) !== 0 ? d : (c || d || "");
    }
  }

  // Normalise any date-looking column in place.
  for (const h of headers) {
    if (!/date/i.test(h)) continue;
    for (const r of rows) {
      const iso = parseIndianDate(r[h]);
      if (iso) r[h] = iso;
    }
  }

  const label = { tally: "Tally", vyapar: "Vyapar", busy: "Busy", generic: "spreadsheet" }[source];
  const bits: string[] = [`Read as a ${label} export`];
  if (skippedTitles.length) bits.push(`skipped ${skippedTitles.length} title row(s)`);
  if (droppedTotals) bits.push(`ignored ${droppedTotals} total/blank row(s)`);
  if (hasDr && hasCr) bits.push("combined Debit/Credit into Amount");

  return { rows, source, headerRow, skippedTitles, droppedTotals, note: bits.join(", ") + "." };
}
