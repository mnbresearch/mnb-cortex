import "server-only";

/*
  ONE CLOCK FOR THE WHOLE NIGHTLY RUN.

  THE PROBLEM THIS SOLVES

  The autopilot cron is a single Vercel function with a 300-second ceiling, and
  it runs thirteen steps in sequence. Every step had its own cap — 200
  collections sweeps, 200 alert deliveries, 200 webhook retries, 100 integration
  syncs, 25 plan emails, 20 daily analyses — and each cap was chosen in
  isolation, as if that step were the only thing running.

  Add them up with realistic latencies and the run exceeds 300s at somewhere
  between 18 and 25 paying workspaces. Two of the caps can exceed it on their
  own: 200 webhook retries at an 8-second timeout each is 1,600 seconds, and
  those are by definition deliveries that already failed, so the timeout is the
  expected case rather than the tail. One customer with a dead webhook URL could
  take the nightly run down for every other customer, at any tenant count.

  WHY A TIMEOUT IS WORSE THAN A DELAY

  Vercel kills the function; it does not unwind it. Everything after the kill
  point simply never happens, and the steps are ordered so the ones that get
  starved are the customer-visible ones — the weekly plan email, the KPI sweep
  that rolls overdue receivables forward as dates change, the daily analysis the
  product is sold on, and the heartbeat that would have told anyone.

  Worse, several steps CLAIM their work before doing it — renewal_notices,
  alerts.notified_at, weekly_plan_sends, collection_policies.last_swept_at. Those
  writes are committed. So a run that times out mid-loop does not postpone that
  work, it destroys it: the rows are marked done and the emails were never sent.

  THE RULE

  A budget is created once, at the top of the run, from the real function
  deadline. Every loop asks it before starting another iteration, and stops
  cleanly when the answer is no — leaving the remaining work unclaimed for
  tomorrow. Steps declare what share of the clock they may use, so a hot step
  cannot starve the ones behind it, and `remaining()` is measured against the
  actual start time rather than re-anchored partway through.
*/

export type Budget = {
  /** Milliseconds left before the function is killed, minus the safety margin. */
  remaining(): number;
  /** True while there is room for another iteration costing roughly `costMs`. */
  ok(costMs?: number): boolean;
  /**
   * A sub-budget for one step, capped at `shareMs` or whatever is left —
   * whichever is smaller. Steps cannot borrow from the steps behind them.
   */
  slice(shareMs: number): Budget;
  /** For the response body, so a run that ran short says so out loud. */
  spentMs(): number;
  startedAt: number;
};

/*
  RESERVE is what the run keeps back for the work that must always happen: the
  heartbeat write and the JSON response. Without it a budget that says "0ms
  left" is already too late — the function is killed before it can record that
  it ran at all, and the health check then reports a dead cron on a night when
  the cron worked perfectly.
*/
const RESERVE_MS = 12_000;

export function createBudget(totalMs: number, startedAt = Date.now()): Budget {
  const deadline = startedAt + Math.max(0, totalMs - RESERVE_MS);

  function make(limit: number): Budget {
    return {
      startedAt,
      remaining: () => Math.max(0, Math.min(limit, deadline - Date.now())),
      /*
        `costMs` is the caller's honest estimate of one more iteration. Asking
        "is there any time left" is the wrong question when an iteration takes
        eight seconds: it lets a loop start work it cannot finish, which is
        exactly how the claim-then-die failure happens.
      */
      ok: (costMs = 0) => Math.min(limit, deadline - Date.now()) > costMs,
      slice: (shareMs: number) => make(Math.min(limit, Math.max(0, shareMs))),
      spentMs: () => Date.now() - startedAt,
    };
  }

  return make(Number.MAX_SAFE_INTEGER);
}

/*
  How the night is divided.

  These are ceilings, not reservations: a step that finishes early hands the
  rest back, because `slice()` also clamps to the real remaining time. The
  ordering below is the order of execution, and the shares are weighted towards
  the things a customer would notice missing.

  Money and entitlement first (they are fast and they must never be skipped),
  then outbound messages a customer is waiting on, then the AI work — which is
  both the slowest and the most tolerant of being finished tomorrow, since the
  rotation cursors mean nothing is lost, only deferred.
*/
export const SHARE = {
  renewals: 15_000,
  reports: 25_000,
  workflows: 25_000,
  collections: 40_000,
  alerts: 20_000,
  webhooks: 20_000,   // was uncapped at 200 × 8s = 1,600s
  sync: 25_000,
  weeklyUpdate: 15_000,
  weeklyPlan: 35_000,
  sweep: 15_000,
  analysis: 45_000,
} as const;

/*
  THE SHARES HAVE TO FIT INSIDE THE FUNCTION, AND THEY DID NOT.

  The original numbers summed to 345,000ms against a limit of
  maxDuration(300s) − RESERVE_MS(12s) = 288,000ms. Every slice is clamped to
  whatever is actually left, so nothing overran and nothing crashed — the
  overdraft was paid entirely by the LAST steps in the order, silently.

  That is the worst way for this to fail, because the order was chosen on
  purpose: the cheap, must-never-skip work goes first and the tolerant AI work
  goes last. Over-subscribing by 20% means the tail is not "finished tomorrow by
  design", it is "cut short every single night by an arithmetic error nobody
  could see". Daily analysis sits last behind an ok(9_000) guard, so on a busy
  night it processed a couple of workspaces instead of twenty.

  These sum to 280,000ms, inside 288,000 with room for the guard itself. The
  ordering and the relative weights are unchanged; every share is scaled down.
  The assertion below throws at MODULE LOAD. Be precise about what that buys:
  only the autopilot route imports a value from this file (everything else uses
  `import type`, which is erased), and that route is force-dynamic — so Next
  never evaluates it during a build. The throw would therefore surface as a 500
  on the cron at 04:00, not as a failed build.

  scripts/test-cron-budget.mjs is the real gate: it asserts the same sum and
  runs in `npm test`. The throw is the belt.
*/
export const SHARE_TOTAL_MS = Object.values(SHARE).reduce((a, b) => a + b, 0);

/** The cron's own maxDuration, in ms. Kept next to the shares it constrains. */
export const CRON_LIMIT_MS = 300_000;

if (SHARE_TOTAL_MS > CRON_LIMIT_MS - RESERVE_MS) {
  throw new Error(
    `cron-budget: SHARE sums to ${SHARE_TOTAL_MS}ms but only ${CRON_LIMIT_MS - RESERVE_MS}ms is available. ` +
    `Every slice clamps, so the overdraft is paid silently by whichever steps run last.`,
  );
}
