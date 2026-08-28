/**
 * RFM scoring and segmentation.
 *
 * THE BUG THIS FIXES. Scores were assigned from fixed universal thresholds:
 *
 *     fScore: 5 needs >= 12 orders/yr, 4 needs >= 8
 *     mScore: 5 needs >= 10,00,000/yr, 4 needs >= 5,00,000
 *
 * and both "Champion" and "Loyal" required f >= 4. Put together, a business
 * whose customers order fewer than 8 times a year COULD NOT HAVE A CHAMPION.
 * Not "rarely" — the branch was unreachable. Every customer fell through to
 * "Needs attention", which is what the sample manufacturer showed: six
 * customers, every one of them recent and high-revenue, all six labelled
 * "Needs attention" and nothing to distinguish the best from the worst.
 *
 * That is most of the market this product sells to. A wholesaler, a machinery
 * maker or a B2B supplier books four to eight orders per customer per year and
 * is a perfectly healthy business. The mirror case is just as broken: a kirana
 * store with ₹40,000-a-year customers scores m = 1 for its entire book, so
 * everybody lands in "Lost".
 *
 * TWO CHANGES:
 *
 *  1. F and M are scored RELATIVE to this workspace's own book as well as
 *     absolutely, and the better of the two wins. Ranking within your own
 *     customers is what textbook RFM actually does — quintiles, not constants —
 *     and it makes the module work at any order cadence or ticket size. Taking
 *     the MAXIMUM rather than replacing means a genuinely large customer is
 *     never demoted just because they sit in a book of larger ones.
 *
 *  2. Frequency and monetary are combined into one VALUE axis before
 *     segmenting. They measure the same underlying thing — what a customer is
 *     worth — and they correlate; requiring both to clear a bar independently
 *     is what made the positive segments unreachable.
 *
 * Recency stays absolute. Days since last order means the same thing in every
 * industry, and the existing 15/30/60/90 buckets are sensible; it also gets a
 * relative floor so a "quiet" book still ranks its most recent buyers.
 */

export type RfmInput = { id: string; name: string; recency: number; frequency: number; monetary: number };
export type RfmScored = RfmInput & { r: number; f: number; m: number; value: number; segment: SegmentName };

export type SegmentName = "Champion" | "Loyal" | "At risk" | "Lost" | "New / promising" | "Needs attention";

const clamp = (n: number) => Math.max(1, Math.min(5, n));

/** Absolute bands — unchanged, so nothing that scored well before scores worse now. */
export const rScore = (d: number) => (d <= 15 ? 5 : d <= 30 ? 4 : d <= 60 ? 3 : d <= 90 ? 2 : 1);
export const fScore = (f: number) => (f >= 12 ? 5 : f >= 8 ? 4 : f >= 4 ? 3 : f >= 2 ? 2 : 1);
export const mScore = (m: number) => (m >= 1_000_000 ? 5 : m >= 500_000 ? 4 : m >= 200_000 ? 3 : m >= 50_000 ? 2 : 1);

/**
 * Rank one value against the book, 1–5.
 *
 * Ties score identically — two customers with the same numbers must never land
 * in different segments, which a naive index-based quintile would do.
 *
 * Returns 1 for books too small to rank (fewer than 4), where "quintile" would
 * be noise dressed up as insight; the absolute score carries those.
 */
export function relativeScore(values: number[], v: number, higherIsBetter: boolean): number {
  const n = values.length;
  if (n < 4) return 1;
  const worse = values.filter((x) => (higherIsBetter ? x < v : x > v)).length;
  return clamp(1 + Math.floor((5 * worse) / n));
}

/**
 * Segment from recency and combined value.
 *
 * `value` is the mean of F and M, rounded — a customer who orders often OR
 * spends heavily is valuable, and demanding both was the original defect.
 */
export function segmentOf(r: number, value: number): SegmentName {
  if (r >= 4 && value >= 4) return "Champion";
  if (value >= 4) return "Loyal";                    // valuable, gone a little quiet
  if (r <= 2 && value >= 3) return "At risk";        // was worth something, now silent
  if (r <= 2 && value <= 2) return "Lost";
  if (r >= 4 && value <= 2) return "New / promising"; // recent but not yet proven
  return "Needs attention";
}

/** Score a whole book together — relative scoring needs every customer in hand. */
export function scoreBook(rows: RfmInput[]): RfmScored[] {
  const recencies = rows.map((c) => c.recency);
  const freqs = rows.map((c) => c.frequency);
  const moneys = rows.map((c) => c.monetary);

  return rows.map((c) => {
    // Recency: lower days is better, hence higherIsBetter = false.
    const r = clamp(Math.max(rScore(c.recency), relativeScore(recencies, c.recency, false)));
    const f = clamp(Math.max(fScore(c.frequency), relativeScore(freqs, c.frequency, true)));
    const m = clamp(Math.max(mScore(c.monetary), relativeScore(moneys, c.monetary, true)));
    const value = clamp(Math.round((f + m) / 2));
    return { ...c, r, f, m, value, segment: segmentOf(r, value) };
  });
}

export const SEGMENT_TONE: Record<SegmentName, string> = {
  Champion: "bg-success/10 text-success border-success/20",
  Loyal: "bg-success/10 text-success border-success/20",
  "At risk": "bg-danger/10 text-danger border-danger/20",
  Lost: "bg-muted text-muted-foreground border-border",
  "New / promising": "bg-primary/10 text-primary border-primary/20",
  "Needs attention": "bg-warning/10 text-warning border-warning/20",
};
