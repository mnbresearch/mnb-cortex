import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { pageAll } from "@/lib/page-all";

/**
 * MSME 45-day exposure, Section 43B(h).
 *
 * Since FY 2023-24, paying a registered MICRO or SMALL supplier later than the
 * statutory window costs the buyer the income-tax deduction for that expense in
 * the year it was incurred — it shifts to the year the payment is actually
 * made. So a late supplier payment raises taxable income in a year that may
 * already be closing.
 *
 * THE DISTINCTION THAT DECIDES WHETHER THIS FEATURE IS HONEST.
 *
 * Only micro and small are covered. Medium is NOT. A supplier can be ninety
 * days overdue and carry zero 43B(h) consequence because they are a medium
 * enterprise or unregistered — and a report that counts them is inflating a tax
 * warning, which is the kind of wrong number an owner acts on.
 *
 * So the totals below separate three things that are genuinely different:
 *
 *   atRisk         micro/small, past the window — the real exposure
 *   notCovered     past the window but medium/unregistered — late, no tax effect
 *   unclassified   we have not been told, so we do not know
 *
 * `unclassified` is reported prominently and never folded into either of the
 * other two. A workspace that has classified nothing must be told its exposure
 * is UNKNOWN rather than shown a reassuring ₹0.
 */

export type ExposureRow = {
  party: string;
  udyam_category: string;
  invoice_count: number;
  total_amount: number;
  oldest_days: number;
  window_days: number;
  past_window: boolean;
  /* Bills from this party still INSIDE the window — shown, never counted. */
  other_count: number;
  other_amount: number;
};

export type Exposure = {
  rows: ExposureRow[];
  atRisk: number;
  atRiskCount: number;
  notCovered: number;
  unclassified: number;
  unclassifiedCount: number;
  totalPayable: number;
  /** True when the workspace has never classified a single supplier. */
  nothingClassified: boolean;
  live: boolean;
  /**
   * Set when the workspace is signed in but the exposure could NOT be worked
   * out (RPC missing or failing). It used to collapse into the signed-out
   * state, so the page told a signed-in owner with forty supplier bills to
   * "Sign in to a workspace with supplier bills" — and showed no exposure at
   * all on the one page whose job is to warn about a tax disallowance.
   */
  error?: string;
};

const EMPTY: Exposure = {
  rows: [], atRisk: 0, atRiskCount: 0, notCovered: 0, unclassified: 0,
  unclassifiedCount: 0, totalPayable: 0, nothingClassified: true, live: false,
};

/** Categories the section actually applies to. */
export const COVERED = new Set(["micro", "small"]);

export async function getMsmeExposure(): Promise<Exposure> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return EMPTY;
  const sb = await createClient();

  let rows: ExposureRow[] = [];
  /* Signed in from here on: a failure is "could not calculate", never the
     signed-out EMPTY state. */
  const failed = (why: string): Exposure => ({ ...EMPTY, live: true, error: why });
  try {
    const { data, error } = await sb.rpc("cortex_msme_exposure", { p_org: orgId });
    if (error) return failed(error.message || "the exposure calculation is unavailable");
    rows = (data as any[] || []).map((r) => ({
      party: r.party,
      udyam_category: r.udyam_category,
      invoice_count: Number(r.invoice_count) || 0,
      total_amount: Number(r.total_amount) || 0,
      oldest_days: Number(r.oldest_days) || 0,
      window_days: Number(r.window_days) || 45,
      past_window: Boolean(r.past_window),
      other_count: Number(r.other_count) || 0,
      other_amount: Number(r.other_amount) || 0,
    }));
  } catch (e: any) { return failed(e?.message || "unknown error"); }

  let atRisk = 0, atRiskCount = 0, notCovered = 0, unclassified = 0, unclassifiedCount = 0, totalPayable = 0;
  let anyClassified = false;

  for (const r of rows) {
    /*
      total_amount is now ONLY the bills past their window; other_amount is the
      rest. The old SQL returned the party's whole balance with a per-party
      "past window" flag, so a supplier with one late bill and nine current ones
      contributed all ten to the exposure — a tax figure overstated tenfold.
    */
    totalPayable += r.total_amount + r.other_amount;
    if (r.udyam_category !== "unclassified") anyClassified = true;

    if (r.udyam_category === "unclassified") {
      unclassified += r.total_amount;
      unclassifiedCount += r.invoice_count;
    } else if (COVERED.has(r.udyam_category) && r.past_window) {
      atRisk += r.total_amount;
      atRiskCount += r.invoice_count;
    } else if (r.past_window) {
      // Late, but medium or unregistered: no 43B(h) consequence.
      notCovered += r.total_amount;
    }
  }

  // Worst first: covered-and-overdue, then oldest.
  rows.sort((a, b) => {
    const rank = (r: ExposureRow) =>
      COVERED.has(r.udyam_category) && r.past_window ? 0 : r.udyam_category === "unclassified" ? 1 : 2;
    return rank(a) - rank(b) || b.oldest_days - a.oldest_days;
  });

  return {
    rows, atRisk, atRiskCount, notCovered, unclassified, unclassifiedCount,
    totalPayable, nothingClassified: !anyClassified, live: true,
  };
}

/** Suppliers on file, for the classification screen. */
/**
 * Create a vendor row for every supplier that appears on a payable bill.
 *
 * WHY THIS EXISTS: WITHOUT IT THE WHOLE FEATURE IS A DEAD END.
 *
 * cortex_msme_exposure derives its supplier list from `invoices` and LEFT JOINs
 * `vendors` for the Udyam classification, so the by-supplier table fills up as
 * soon as payables are imported. But VendorClassifier can only classify rows it
 * has ids for, and those come from `vendors`.
 *
 * `vendors` was populated exactly once, by a backfill statement at the bottom
 * of 2026_msme_43bh.sql — `insert into vendors (org_id, name) select distinct …
 * from invoices where type = 'payable'`. A one-time INSERT, not a trigger. So
 * the table is correct for payables that existed when that migration ran, and
 * empty for every payable imported afterwards. Which means it works for nobody
 * who signs up from now on, since a new customer imports after the migration by
 * definition. No ongoing path wrote to it: not the CSV importer, not
 * importFromUrl, not the manual invoice form.
 *
 * It was invisible to tests because scripts/test-msme.mjs inserts its fixture
 * bills and THEN applies the migration, so the backfill sweeps them up. Real
 * life runs in the opposite order. The suite passed on an ordering that cannot
 * occur in production.
 *
 * So every workspace saw, simultaneously:
 *
 *   · "Your exposure is unknown, not zero … Classify them below — it takes a
 *     minute and only needs doing once."
 *   · a table listing eight suppliers, every one of them "Unclassified"
 *   · "None of your 0 suppliers has been classified yet"
 *   · and, under Classify your suppliers: "No suppliers on file yet. They
 *     appear here automatically from your payable bills — import or add a
 *     purchase invoice and this list fills itself."
 *
 * The instruction was impossible to follow. Importing purchase invoices did not
 * fill the list, because no code path could. 43B(h) exposure was therefore
 * permanently "unclassified" for every customer, on a feature the product is
 * sold on — and the page counted 0 suppliers while showing eight.
 *
 * Idempotent, and called on the way into /msme rather than only from the
 * importer, so workspaces that already imported payables heal on next visit
 * instead of needing to import again. `vendors_org_name_key (org_id, name)`
 * makes the upsert safe against races and repeat visits.
 *
 * Deliberately does NOT filter out paid bills. A supplier is a supplier whether
 * or not this particular bill is settled, and classifying them once is the
 * point; filtering would make a vendor appear and disappear as bills are paid.
 */
/**
 * Returns how many vendor rows were added, and — new — an `error` when the
 * sync could not run. The comment below always said "a failed sync must not
 * be silent", and then the code returned 0, which is indistinguishable from
 * "nothing new to add". The page now shows the reason.
 *
 * Both reads are PAGED (lib/page-all): bills used to stop at 5,000 and
 * vendors at 5,000 here and 500 in listVendors, so suppliers beyond those
 * caps never got a row and could never be classified.
 */
export async function syncVendorsFromPayables(): Promise<{ added: number; error?: string }> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { added: 0 };
  const sb = await createClient();
  try {
    const billsRes = await pageAll<any>((a, b) => sb.from("invoices")
      .select("id, party").eq("org_id", orgId).ilike("type", "payable").order("id").range(a, b));
    if (billsRes.error) return { added: 0, error: `Could not read your supplier bills: ${billsRes.error}` };
    const bills = billsRes.rows;
    if (!bills.length) return { added: 0 };

    const existingRes = await pageAll<any>((a, b) => sb.from("vendors")
      .select("id, name").eq("org_id", orgId).order("id").range(a, b));
    if (existingRes.error) return { added: 0, error: `Could not read your supplier list: ${existingRes.error}` };
    const have = new Set(existingRes.rows.map((v) => normName(v.name)));

    const seen = new Set<string>();
    const toAdd: Array<{ org_id: string; name: string }> = [];
    for (const b of bills as any[]) {
      const raw = String(b.party ?? "").trim();
      if (!raw) continue;
      const n = normName(raw);
      if (!n || have.has(n) || seen.has(n)) continue;
      seen.add(n);
      toAdd.push({ org_id: orgId, name: raw });
    }
    if (!toAdd.length) return { added: 0 };

    const { error: insErr } = await sb.from("vendors")
      .upsert(toAdd, { onConflict: "org_id,name", ignoreDuplicates: true });
    /*
      A failed sync must not be silent: the page would then show the same
      impossible "no suppliers on file" state with no explanation. The caller
      still reads whatever is already there, AND shows this reason.
    */
    if (insErr) return { added: 0, error: `Could not add ${toAdd.length} new supplier(s) from your bills: ${insErr.message}` };
    return { added: toAdd.length };
  } catch (e: any) { return { added: 0, error: `Could not sync suppliers from your bills: ${e?.message || "unknown error"}` }; }
}

/**
 * Same normalisation the SQL side uses, so a vendor row we create here actually
 * joins to the bill it came from. cortex_norm_name() is case- and
 * punctuation-insensitive; this mirrors it closely enough to dedupe before
 * insert, and the unique index is the real guarantee.
 */
function normName(raw: string | null | undefined): string {
  return String(raw ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Every vendor, paged — not the first 500 — so the classifier and the
 * agreement toggle cover every supplier the exposure table can show.
 * `written_agreement_recorded_at` arrives with 2026_zzzz_c_msme_agreement_unknown.sql;
 * before that migration the read retries without it (agreement then reads as
 * unknown, which is the truth).
 */
export async function listVendors(): Promise<any[]> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return [];
  const sb = await createClient();
  const read = (cols: string) => pageAll<any>((a, b) => sb.from("vendors")
    .select(cols).eq("org_id", orgId).order("name").order("id").range(a, b));
  try {
    let r = await read("id, name, udyam_category, udyam_number, has_written_agreement, written_agreement_recorded_at, category");
    if (r.error && /written_agreement_recorded_at/i.test(r.error)) {
      r = await read("id, name, udyam_category, udyam_number, has_written_agreement, category");
    }
    return r.rows;
  } catch { return []; }
}
