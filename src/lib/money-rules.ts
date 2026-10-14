/**
 * Small, pure money rules that more than one screen must agree on.
 *
 * Pure on purpose: no imports, no I/O, safe in a client bundle and importable
 * by scripts/test-numbers-fixes.mjs with a relative ".ts" path. Each rule
 * exists because two screens used to compute "the same" figure two different
 * ways and printed different answers for one ledger.
 */

/* ======================================================================== */
/* RECEIVABLES: one definition of "open" and "past due"                     */
/* ======================================================================== */

/**
 * The dashboard's rule, restated so every other screen can use it verbatim.
 *
 * Mirrors the SQL aggregate (2026_zz_aggregate_ist_overdue.sql) and the
 * TypeScript fallback in lib/metrics.ts:
 *
 *   status = lower(coalesce(status, 'pending'))
 *   type   = lower(coalesce(type,   'receivable'))
 *   open      : status <> 'paid' and type <> 'payable'
 *   past due  : open and (status = 'overdue' or due_date < today (IST))
 *
 * So an invoice with NO type counts as a receivable (that is what the
 * dashboard has always done), and an invoice the owner marked "overdue"
 * counts as past due even when its due date is missing.
 */
export function receivableStatus(inv: { status?: unknown }): string {
  return String(inv?.status ?? "pending").toLowerCase() || "pending";
}

export function isOpenReceivable(inv: { status?: unknown; type?: unknown }): boolean {
  const type = String(inv?.type ?? "receivable").toLowerCase() || "receivable";
  return receivableStatus(inv) !== "paid" && type !== "payable";
}

/** `todayIST` is a YYYY-MM-DD string for the business's own calendar day. */
export function isPastDueReceivable(
  inv: { status?: unknown; type?: unknown; due_date?: unknown },
  todayIST: string,
): boolean {
  if (!isOpenReceivable(inv)) return false;
  if (receivableStatus(inv) === "overdue") return true;
  const due = inv?.due_date ? String(inv.due_date).slice(0, 10) : "";
  return Boolean(due) && due < todayIST;
}

/* ======================================================================== */
/* RUNWAY: did the balance actually reach zero?                             */
/* ======================================================================== */

export type RunwayProjection = {
  /** Month-end balances, month 0 = the opening balance. Floored at 0 for display. */
  series: number[];
  /** True only if the simulated balance actually reached zero within the horizon. */
  hitZero: boolean;
  /** Months until the balance reached zero; null when it never did. */
  monthsToZero: number | null;
  /** burn − revenue for the opening month. ≤ 0 means cash-positive right now. */
  netBurnNow: number;
  horizon: number;
};

/**
 * Simulate cash month by month and report whether it ran out.
 *
 * The version this replaces stopped simulating as soon as one month was
 * cash-positive, judged "profitable" on month 0 alone, and printed "60" when
 * the loop simply ran out of months — so a balance that never touched zero
 * read as sixty months of runway with an out-of-cash date five years out, and
 * a business that turned positive in month 3 still showed a zero date.
 *
 * The only honest answers are "it reaches zero in month N" and "it does not
 * reach zero within the horizon". Both are derived from the balance itself.
 */
export function projectRunway(
  { cash, burn, revenue, growthPct, horizon = 60 }:
  { cash: number; burn: number; revenue: number; growthPct: number; horizon?: number },
): RunwayProjection {
  const netBurnNow = burn - revenue;
  let bal = cash, rev = revenue;
  const series: number[] = [Math.max(bal, 0)];
  if (!(bal > 0)) return { series, hitZero: true, monthsToZero: 0, netBurnNow, horizon };
  for (let month = 1; month <= horizon; month++) {
    bal -= burn - rev;
    rev = rev * (1 + growthPct / 100);
    series.push(Math.max(bal, 0));
    if (bal <= 0) return { series, hitZero: true, monthsToZero: month, netBurnNow, horizon };
  }
  return { series, hitZero: false, monthsToZero: null, netBurnNow, horizon };
}

/* ======================================================================== */
/* 13-WEEK CASH: schedule money by when it is actually due                  */
/* ======================================================================== */

export type DatedAmount = { amount: number; due: string | null };

export type WeeklySchedule = {
  weeks: number[];
  /** Already past due on day one — placed in week 1, and said so. */
  overdueInWeek1: number;
  /** More than `doubtfulAfterDays` past due — left out of the forecast as doubtful. */
  excludedDoubtful: number;
  /** No due date at all, with `undated: "week1"` — placed in week 1. */
  undatedInWeek1: number;
  /** No due date at all, with `undated: "exclude"` — left out, total shown. */
  undatedExcluded: number;
  /** Due after the 13-week window — not in this forecast. */
  beyondWindow: number;
};

/**
 * Put each open amount into the week it falls due.
 *
 * The rule, stated on the page:
 *   - due within the 13 weeks          → that week
 *   - already overdue ≤ N days          → week 1 (the earliest it could land)
 *   - overdue > N days                  → excluded as doubtful, total shown
 *   - no due date                       → week 1 or excluded (caller's choice:
 *                                         inflows exclude, outflows take week 1,
 *                                         so an unknown never flatters cash)
 *   - due after week 13                 → not in this window
 *
 * Spreading every unpaid invoice evenly across the quarter — what this
 * replaces — put an invoice 200 days overdue into weeks 1–13 in equal slices,
 * and an invoice due in week 12 partly into week 1.
 */
export function scheduleByDueDate(
  rows: DatedAmount[],
  todayIST: string,
  { weeks = 13, doubtfulAfterDays = 90, undated = "week1" }:
  { weeks?: number; doubtfulAfterDays?: number; undated?: "week1" | "exclude" } = {},
): WeeklySchedule {
  const out: WeeklySchedule = {
    weeks: Array.from({ length: weeks }, () => 0),
    overdueInWeek1: 0, excludedDoubtful: 0, undatedInWeek1: 0, undatedExcluded: 0, beyondWindow: 0,
  };
  const today = Date.parse(`${todayIST}T00:00:00Z`);
  for (const r of rows) {
    const amt = Number(r.amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const iso = r.due ? String(r.due).slice(0, 10) : "";
    const dueMs = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T00:00:00Z`) : NaN;
    if (!Number.isFinite(dueMs) || !Number.isFinite(today)) {
      if (undated === "exclude") { out.undatedExcluded += amt; continue; }
      out.weeks[0] += amt; out.undatedInWeek1 += amt; continue;
    }
    const days = Math.round((dueMs - today) / 86_400_000);
    if (days < 0) {
      if (-days > doubtfulAfterDays) { out.excludedDoubtful += amt; continue; }
      out.weeks[0] += amt; out.overdueInWeek1 += amt; continue;
    }
    const w = Math.floor(days / 7);
    if (w >= weeks) { out.beyondWindow += amt; continue; }
    out.weeks[w] += amt;
  }
  out.weeks = out.weeks.map((v) => Math.round(v));
  return out;
}

/* ======================================================================== */
/* REVENUE BASELINE: the last COMPLETE month, never month-to-date           */
/* ======================================================================== */

/**
 * The newest ledger month strictly before the current month that carries a
 * non-zero revenue figure. `rows` may arrive in any order; `currentMonth` is
 * "YYYY-MM". Returns null when there is no complete month on file.
 */
export function lastCompleteMonthRevenue(
  rows: { period?: unknown; revenue?: unknown }[],
  currentMonth: string,
): { period: string; revenue: number } | null {
  let best: { period: string; revenue: number } | null = null;
  for (const r of rows || []) {
    const p = String(r?.period ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(p) || p >= currentMonth) continue;
    const v = Number(r?.revenue);
    if (!Number.isFinite(v) || v === 0) continue;
    if (!best || p > best.period) best = { period: p, revenue: v };
  }
  return best;
}

/* ======================================================================== */
/* YEAR ON YEAR: the same calendar days, the same month, last year          */
/* ======================================================================== */

export type LikeForLikeWindows = {
  /** This month so far: [thisStart, thisEnd) — thisEnd is the day AFTER today. */
  thisStart: string; thisEnd: string;
  /** The same month last year, days 1..same day: [lastStart, lastEnd). */
  lastStart: string; lastEnd: string;
  /** How many calendar days each window covers (equal unless last year's month is shorter). */
  days: number;
};

/**
 * The two date windows a like-for-like "YoY" must compare, from the
 * business's own (IST) calendar day `todayIST` (YYYY-MM-DD).
 *
 * The growth KPI used to set this month-to-date against the WHOLE month eleven
 * months earlier — 14 days of October against 30 days of last November — so
 * every month read as a collapse until its last day, and it was not even the
 * same month of the year. Now: days 1..D of this month against days 1..D of
 * the same month last year, D clamped to that month's length (29 Feb → 28 Feb).
 * End dates are exclusive so callers can use `>= start and < end`.
 */
export function likeForLikeWindows(todayIST: string): LikeForLikeWindows | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(todayIST || ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  const daysIn = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const lastDay = Math.min(d, daysIn(y - 1, mo));
  return {
    thisStart: iso(y, mo, 1), thisEnd: iso(y, mo, d + 1),
    lastStart: iso(y - 1, mo, 1), lastEnd: iso(y - 1, mo, lastDay + 1),
    days: d,
  };
}
