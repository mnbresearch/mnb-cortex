/*
  Relative, WITH the extension, rather than the "@/lib/…" alias used everywhere
  else in this codebase. That is deliberate: node resolves this path and does
  not resolve the alias, so scripts/test-import-detect.mjs can execute the real
  function instead of a copy of it. tsconfig's "moduleResolution": "bundler"
  accepts the .ts extension, and webpack resolves it too.
*/
import { IMPORT_COLS, resolveHeaders } from "./import-map.ts";

/*
  WHICH DATASET IS THIS FILE?

  THE BUG THIS EXISTS TO FIX, WHICH IS THE WORST ONE IN THE PRODUCT'S FUNNEL.

  The import screen opens with the dataset dropdown set to "Sales orders",
  because that happened to be first in the list. Cortex is sold on receivables:
  the landing page, the onboarding wizard and the setup path all promise that
  importing your invoices shows you what is overdue.

  So the default path was: an owner exports their invoices, uploads the file,
  presses Import without touching a dropdown they had no reason to notice, and
  Cortex writes their invoices into `sales_orders`. Every header matched — an
  invoice file has a party, an amount, a number — so nothing looked wrong. It
  reported "✓ Imported 412 rows". The setup path ticked "Bring in your invoices"
  off, because that step only checks whether ANY data exists.

  And then no receivables warning could ever appear, because there were no
  invoices. The one screen the product is sold on stayed empty, for the most
  likely sequence of actions a new customer can take, with a success message on
  screen and a tick in the setup checklist saying it had worked.

  That is not a funnel leak. It is the product silently failing at the only job
  the customer bought it for, while telling them it succeeded.

  HOW THIS DECIDES

  Every dataset is scored with the SAME resolveHeaders() the import itself uses,
  so the guess can never disagree with what the import would actually do.

  A raw matched-column count does not compare across datasets: `employees` has
  five target columns and `invoices` seven, and "name" matches something in
  nearly all of them. What separates them is the columns only one dataset has.
  An invoice register has an invoice number and a due date; a stock list has a
  SKU and a reorder level; a payroll sheet has a CTC. Those are the SIGNATURE
  columns below, and they carry most of the weight.

  DELIBERATELY REFUSES TO GUESS when two datasets score alike. `leads` and
  `customers` are both name/email/phone and genuinely cannot be told apart from
  headers — so `confident` comes back false and the caller leaves the user's own
  choice alone. A confident wrong switch is worse than no switch: it moves the
  data somewhere the owner did not ask for and did not see.

  No I/O, no imports beyond the map itself, so scripts/test-import-detect.mjs
  runs the real function.
*/

/**
 * Columns that effectively belong to one dataset.
 *
 * Not "columns that matter" — columns whose presence is EVIDENCE. `amount`
 * appears in invoices and sales orders both and so is worth nothing here;
 * `due_date` appears in one.
 */
const SIGNATURE: Record<string, string[]> = {
  invoices: ["invoice_no", "due_date", "type"],
  sales_orders: ["order_no", "region"],
  inventory_items: ["sku", "on_hand", "reorder_level", "unit_cost"],
  employees: ["monthly_ctc", "department", "performance"],
  production_runs: ["machine", "shift", "planned_qty", "actual_qty", "oee"],
  leads: ["source", "plan"],
  customers: ["company"],
};

export type DatasetGuess = {
  /** Best-scoring dataset. Always a real key of IMPORT_COLS. */
  table: string;
  /** How many of that dataset's signature columns were found. */
  signals: number;
  /** Total columns matched, for display. */
  matched: number;
  /**
   * True only when one dataset wins on evidence the runner-up lacks. False
   * means "several of these fit" — the caller must not override the user.
   */
  confident: boolean;
  /** Runner-up, for a message that names the real ambiguity. Null when alone. */
  runnerUp: string | null;
};

/** Scored, worst-to-best comparable across datasets of different widths. */
function scoreTable(table: string, headers: string[]) {
  const m = resolveHeaders(table, headers);
  const signals = (SIGNATURE[table] || []).filter((c) => m.map[c]).length;
  const coverage = m.total > 0 ? m.matched / m.total : 0;

  /*
    Signature columns dominate (×10) because they are the only real evidence.
    Raw matched count and coverage break ties between datasets that found the
    same number of signature columns — a file matching 6 of 7 invoice columns is
    a better invoice file than one matching 2 of 7.
  */
  return { table, m, signals, coverage, score: signals * 10 + m.matched + coverage * 2 };
}

/**
 * Guess the dataset from a file's headers.
 *
 * `candidates` exists so the UI can restrict the guess to the datasets it
 * actually offers — guessing a table the dropdown cannot select would produce a
 * switch the user is unable to undo.
 */
export function detectDataset(headers: string[], candidates?: string[]): DatasetGuess | null {
  const clean = (headers || []).map((h) => String(h ?? "")).filter((h) => h.trim() !== "");
  if (!clean.length) return null;

  const tables = (candidates && candidates.length ? candidates : Object.keys(IMPORT_COLS))
    .filter((t) => IMPORT_COLS[t]);
  if (!tables.length) return null;

  const scored = tables.map((t) => scoreTable(t, clean)).sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1] || null;

  /* Nothing recognised anywhere — the import itself will refuse and explain. */
  if (best.m.matched === 0) return null;

  /*
    Confidence needs THREE things, and the third was learned from a test.

    1. At least one signature column, and
    2. a clear margin over the runner-up — 10, exactly one signature column, so
       "this file has a due date and that one does not" is decisive while
       "both matched three generic columns" is not. The tests pin the two ends
       of that rule — one signature column of separation IS decisive, a
       fraction of a point is NOT — and deliberately do not pin the integer
       itself, because scores cluster below 2 or above 10 and nothing real
       lands between, and
    3. AT LEAST TWO COLUMNS MATCHED IN TOTAL.

    (3) is not redundant. resolveHeaders' second pass matches on substring in
    either direction, so a column literally named "bar" matches `barcode` and
    resolves to `sku` — which is a signature column for inventory. A file of
    four junk headers therefore scored one signature column, beat every other
    dataset by more than 10 (they matched nothing at all), and would have
    confidently switched the owner's dataset to Inventory items.

    Requiring two matches closes it, because the substring pass needs a real
    coincidence to fire twice on the same dataset, and no genuine export
    matches only one column.

    ON (1) BEING CURRENTLY REDUNDANT: mutation testing showed that removing
    `signals >= 1` breaks no test, and that is not a gap in the suite — for this
    SIGNATURE map it cannot break one. A zero-signal dataset would need roughly
    nine more matched columns than the runner-up to clear the margin, and the
    widest table here has seven; any file matching most of a table's columns
    hits one of its signature columns on the way. It stays because it is the
    actual rule being expressed, and because shrinking the margin later would
    make it load-bearing again.
  */
  const confident =
    best.signals >= 1 && best.m.matched >= 2 && (!second || best.score - second.score >= 10);

  return {
    table: best.table,
    signals: best.signals,
    matched: best.m.matched,
    confident,
    runnerUp: second ? second.table : null,
  };
}

/** Human dataset names, so a warning can name the table the owner recognises. */
export const DATASET_LABELS: Record<string, string> = {
  sales_orders: "Sales orders",
  invoices: "Invoices",
  inventory_items: "Inventory items",
  employees: "Employees",
  leads: "Leads",
  customers: "Customers",
  production_runs: "Production runs",
};

export const datasetLabel = (t: string) => DATASET_LABELS[t] || t;

/**
 * What to tell the owner when their chosen dataset disagrees with the file.
 *
 * Returns null when there is nothing worth saying — the guess agrees, or it is
 * not confident enough to contradict a deliberate choice.
 *
 * The consequence is spelled out rather than implied. "This looks like
 * Invoices" invites a shrug; "your invoices will not appear in receivables"
 * is the thing the owner would actually mind, and it is the truth.
 */
export function mismatchWarning(chosen: string, guess: DatasetGuess | null): string | null {
  if (!guess || !guess.confident || guess.table === chosen) return null;

  const from = datasetLabel(chosen);
  const to = datasetLabel(guess.table);

  if (guess.table === "invoices") {
    return `This file looks like ${to}, not ${from}. Imported as ${from}, it will not appear in Receivables `
      + `and cannot produce an overdue warning — which is the thing Cortex is for. Switch the dataset above if this is an invoice register.`;
  }
  return `This file looks like ${to}, not ${from}. Importing it as ${from} will put the rows where the ${to} screens cannot read them.`;
}
