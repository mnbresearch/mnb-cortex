import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

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
  const sb = createClient();

  let rows: ExposureRow[] = [];
  try {
    const { data, error } = await sb.rpc("cortex_msme_exposure", { p_org: orgId });
    if (error) return EMPTY;   // migration not applied — say nothing rather than guess
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
  } catch { return EMPTY; }

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
export async function syncVendorsFromPayables(): Promise<number> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return 0;
  const sb = createClient();
  try {
    const { data: bills, error } = await sb.from("invoices")
      .select("party").eq("org_id", orgId).eq("type", "payable").limit(5000);
    if (error || !bills?.length) return 0;

    const { data: existing } = await sb.from("vendors")
      .select("name").eq("org_id", orgId).limit(5000);
    const have = new Set((existing as any[] || []).map((v) => normName(v.name)));

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
    if (!toAdd.length) return 0;

    const { error: insErr } = await sb.from("vendors")
      .upsert(toAdd, { onConflict: "org_id,name", ignoreDuplicates: true });
    /*
      A failed sync must not be silent: the page would then show the same
      impossible "no suppliers on file" state with no explanation. Returning 0
      lets the caller fall back to reading whatever is already there.
    */
    if (insErr) return 0;
    return toAdd.length;
  } catch { return 0; }
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

export async function listVendors(): Promise<any[]> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return [];
  const sb = createClient();
  try {
    const { data } = await sb.from("vendors")
      .select("id, name, udyam_category, udyam_number, has_written_agreement, category")
      .eq("org_id", orgId).order("name").limit(500);
    return (data as any[]) || [];
  } catch { return []; }
}
