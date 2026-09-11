import type { DerivedInsight } from "@/lib/insights";

/*
  WHAT THE IMPORT SCREEN SAYS WHEN IT WORKED.

  Pure, and separate from actions.ts — which is "use server" and unloadable from
  a test process — so scripts/test-import-outcome.mjs runs these functions
  rather than reading them. The `import type` above is erased at compile time,
  so this module has no runtime dependency on anything.

  TWO PROBLEMS, BOTH OF THEM ABOUT TELLING THE TRUTH AFTER A SUCCESS.

  1. THE NUMBERS DID NOT ADD UP AND NOTHING SAID WHY. The preview announced
     "4,312 rows detected", the result announced "✓ Imported 1000 rows", and
     there was no third sentence. Two separate causes were being hidden behind
     one silence — a hard `slice(0, 1000)` cap, and the duplicate-key collapse
     that keeps the last row per invoice number. An owner cannot tell data loss
     from de-duplication, so they must assume the worse one.

  2. THE WARNING WAS COMPUTED AND THEN THROWN AWAY. The import awaits a full
     recompute, which derives every insight synchronously — "₹42.00 L of
     receivables is past its due date" existed, in memory, at the moment the
     screen said "✓ Imported 412 rows into Invoices." It was written to a table
     and discarded, and the owner was left to guess which of thirty sidebar
     links would show them the consequence.
*/

/**
 * The most rows one import will accept.
 *
 * A ceiling still has to exist — a pasted 500,000-row sheet will exhaust the
 * server action's time or memory, and failing at row 400,000 is worse than
 * refusing at the start. What changed is that this one is REPORTED. The old
 * 1,000 was both far too low for a real wholesaler's year of invoices and
 * completely silent.
 */
export const ROW_CEILING = 10_000;

/** Every screen whose figures change when rows are imported. */
export const REVALIDATE_AFTER_IMPORT = [
  "/dashboard",
  "/sales",
  "/finance",
  "/inventory",
  "/hr",
  /*
    The four that were missing, and the reason the two import paths had
    different lists at all: each was extended once, separately, for whatever
    page the author happened to be looking at.

    /receivables is the worst omission — it is the screen the product is sold
    on and the one the post-import warning now links to. All of these set
    `dynamic = "force-dynamic"`, so this was masked rather than broken, which
    is exactly how it survived.
  */
  "/receivables",
  "/msme",
  "/alerts",
  "/data",
] as const;

export type CappedRows<T> = { rows: T[]; cappedAt: number | null };

/** Trim to the ceiling, recording whether it actually bit. */
export function capRows<T>(rows: T[], ceiling = ROW_CEILING): CappedRows<T> {
  const all = Array.isArray(rows) ? rows : [];
  if (all.length <= ceiling) return { rows: all, cappedAt: null };
  return { rows: all.slice(0, ceiling), cappedAt: ceiling };
}

const n = (x: number) => x.toLocaleString("en-IN");

/**
 * Account for every row in the file: detected, written, and why the difference.
 *
 * Returns `{}` — not `{ skipped: 0 }` — when the counts agree, so the caller
 * spreads nothing into its result and the UI has no "0 rows skipped" line to
 * render.
 */
export function accountForRows(
  detected: number,
  capped: { cappedAt: number | null },
  written: number,
): { skipped?: number; skippedReason?: string } {
  const skipped = Math.max(0, (Number(detected) || 0) - (Number(written) || 0));
  if (skipped === 0) return {};

  /*
    The cap and the key collapse can both be in play at once — a 12,000-row file
    with repeated invoice numbers. The cap is named first because it is the one
    that means rows are genuinely NOT IN the workspace and the owner has to do
    something about it; a merge is complete, just smaller.
  */
  if (capped.cappedAt) {
    const overflow = detected - capped.cappedAt;
    return {
      skipped,
      skippedReason:
        `${n(detected)} rows were in the file and this import takes ${n(capped.cappedAt)} at a time, `
        + `so ${n(overflow)} were not read. Split the file and import the rest — nothing already saved will be duplicated.`,
    };
  }

  return {
    skipped,
    skippedReason:
      `${n(detected)} rows were in the file and ${n(written)} were saved. The difference is repeated `
      + `invoice or order numbers: Cortex keeps one row per number, using the last one in the file, so the same `
      + `invoice is never counted twice.`,
  };
}

export type ImportWarning = {
  title: string;
  detail: string;
  severity: string;
  route?: string;
};

/**
 * The one finding worth putting on the screen the owner is already looking at.
 *
 * deriveInsights() already returns worst-first, so this is the head of the list
 * — but it re-checks the ordering rather than trusting it, because the cost of
 * being wrong here is showing an owner "Revenue is up 24%" while ₹42 L sits
 * overdue.
 */
export function topWarning(insights: DerivedInsight[] | null | undefined): ImportWarning | null {
  const list = (insights || []).filter((i) => i && i.title);
  if (!list.length) return null;

  const rank: Record<string, number> = { red: 0, yellow: 1, green: 2 };
  const worst = list
    .slice()
    .sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))[0];

  return {
    title: worst.title,
    detail: worst.detail,
    severity: worst.severity,
    route: worst.route,
  };
}
