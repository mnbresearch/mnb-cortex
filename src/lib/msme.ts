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
    }));
  } catch { return EMPTY; }

  let atRisk = 0, atRiskCount = 0, notCovered = 0, unclassified = 0, unclassifiedCount = 0, totalPayable = 0;
  let anyClassified = false;

  for (const r of rows) {
    totalPayable += r.total_amount;
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
