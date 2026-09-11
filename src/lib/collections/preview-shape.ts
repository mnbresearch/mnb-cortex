/*
  THE ARITHMETIC OF THE DRY RUN, SEPARATED SO IT CAN BE EXECUTED.

  NO IMPORTS IN THIS FILE, DELIBERATELY — not even `import type` from
  @/lib/collections, because the point is that `node` can load this module and
  run it. preview.ts carries `import "server-only"`, which makes it unloadable
  outside Next; if the counting lived there the only way to check these numbers
  would be to read them.

  That is not a hypothetical concern. The first version of this screen reported
  `wouldChase.length` — a 25-row DISPLAY slice — next to a total summed over
  every qualifying invoice. A workspace with 40 overdue invoices would have been
  told "25 invoices worth ₹18,40,000": a count from one set and a value from
  another, in the one card whose entire job is to make the owner trust what the
  software will do in their name. It was found by reading, which is luck.

  So: preview.ts fetches, this file counts, and scripts/test-collections-preview
  executes it.

  The input type is declared STRUCTURALLY rather than imported so this file has
  no dependency edge at all. It is checked against the real `Candidate` in
  preview.ts, where the compiler sees both.
*/

export type ShapeCandidate = {
  party: string;
  invoiceNo: string | null;
  amount: number;
  daysPastDue: number;
  blockedBy: string | null;
  contact: { email: string | null; phone: string | null };
};

export type PreviewLine = {
  party: string;
  invoiceNo: string | null;
  amount: number;
  daysPastDue: number;
  channel: "email" | "whatsapp" | "none";
};

/*
  Generic in the candidate type so `top` comes back as whatever the caller put
  in, not narrowed to ShapeCandidate. The real Candidate carries dueDate, which
  the drafting step needs and this file has no business knowing about.
*/
export type Shaped<T extends ShapeCandidate = ShapeCandidate> = {
  /** Display slice, worst first. Never the source of a count. */
  wouldChase: PreviewLine[];
  /** Every qualifying invoice, not the slice. */
  wouldChaseCount: number;
  wouldChaseValue: number;
  excluded: { reason: string; count: number; value: number }[];
  excludedValue: number;
  /** The candidate the sample message should be drafted from, or null. */
  top: T | null;
};

/** How many rows the table can show before it stops being a table. */
export const DISPLAY_LIMIT = 25;

/**
 * Which channel a reminder would actually go out on.
 *
 * Email wins when both are present — same precedence as the send path, which
 * picks email and only falls back to WhatsApp. "none" cannot appear among
 * qualifying candidates (no contact is itself a block) but is representable so
 * that a future caller passing unfiltered rows gets an honest answer instead of
 * a confident wrong one.
 */
export function channelFor(c: ShapeCandidate): "email" | "whatsapp" | "none" {
  if (c.contact.email) return "email";
  if (c.contact.phone) return "whatsapp";
  return "none";
}

const money = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Split candidates into what would be chased and what would not, with the
 * exclusions grouped by reason.
 *
 * Pure: no clock, no database, no policy beyond what the caller already read.
 */
export function shapePreview<T extends ShapeCandidate>(candidates: T[]): Shaped<T> {
  const all: T[] = Array.isArray(candidates) ? candidates : [];

  /* Sorted once and reused, so the sample message is unambiguously the first
     row of the table rendered above it. Biggest first — that is the order an
     owner would chase in, and the order the engine itself uses. */
  const qualifying = all
    .filter((c) => !c.blockedBy)
    .slice()
    .sort((a, b) => money(b.amount) - money(a.amount));

  const wouldChase: PreviewLine[] = qualifying.slice(0, DISPLAY_LIMIT).map((c) => ({
    party: c.party,
    invoiceNo: c.invoiceNo,
    amount: money(c.amount),
    daysPastDue: c.daysPastDue,
    channel: channelFor(c),
  }));

  /* Summed over ALL of qualifying, and paired with a count taken from the same
     set. These two lines must never diverge — see the header. */
  const wouldChaseCount = qualifying.length;
  const wouldChaseValue = qualifying.reduce((n, c) => n + money(c.amount), 0);

  /* Grouped with the value attached: "12 invoices worth ₹3.2L have no email
     address" is an instruction to go and add them; a bare count is not. */
  const byReason = new Map<string, { count: number; value: number }>();
  for (const c of all) {
    if (!c.blockedBy) continue;
    const key = String(c.blockedBy);
    const cur = byReason.get(key) || { count: 0, value: 0 };
    cur.count++;
    cur.value += money(c.amount);
    byReason.set(key, cur);
  }
  const excluded = [...byReason.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, value: v.value }))
    .sort((a, b) => b.value - a.value || a.reason.localeCompare(b.reason));

  return {
    wouldChase,
    wouldChaseCount,
    wouldChaseValue,
    excluded,
    excludedValue: excluded.reduce((n, e) => n + e.value, 0),
    top: qualifying[0] || null,
  };
}
