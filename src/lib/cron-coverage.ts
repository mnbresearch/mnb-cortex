/*
  THE NIGHTLY RUN'S COVERAGE, TURNED INTO A VERDICT SOMETHING CAN READ.

  WHAT WAS WRONG

  api/cron/autopilot already computed a `coverage` block and its own comment
  said the right thing: "`nights_for_full_cycle` is the number to watch: if it
  starts climbing, the caps need raising … and that should be a decision rather
  than a discovery."

  It was then returned in the HTTP response to Vercel's cron scheduler, which
  nobody reads, and stored nowhere. A grep for the field name found exactly two
  hits: the line that computes it, and a comment elsewhere pointing at the line
  that computes it. So the number existed and no human or check ever saw it.
  When the caps do start biting, the product would not say so — the first
  signal would be a customer asking why their warnings had gone quiet.

  That is the actual defect. Not the caps: the caps are a real constraint (a
  300-second function budget shared by every step of the run) and 200
  workspaces a night is genuinely fine for a long while. The defect is that
  crossing the line is silent.

  WHY A SEPARATE, PURE MODULE

  The rule below is arithmetic over four numbers, and it decides whether the
  status page goes yellow. Inside the health check it would be untestable
  without a database; here a test can execute the real function — and mutate it
  to prove the assertions actually bite. Nothing in this file imports anything,
  which is what makes that possible.

  NOTHING HERE IS SPECULATIVE. Every threshold below is either a fact about the
  schedule (one run per night) or a constant that already exists in the code
  being measured.
*/

/** One rotating lane of the nightly run. */
export type CoverageLane = {
  /** Workspaces in scope for this lane. */
  total: number;
  /**
   * How many were ACTUALLY processed — not how many were planned.
   *
   * The distinction is the whole point. The sweep loop breaks when it runs out
   * of budget, so a run can be handed 200 workspaces and finish 60. Recording
   * the plan would make a truncated run look complete, which is the same class
   * of lie this module exists to remove.
   */
  done: number;
  /** The per-night ceiling this lane is capped at. */
  cap: number;
};

export type CronCoverage = {
  /** ISO timestamp of the run that produced these numbers. */
  at: string;
  /** The deterministic engine: metrics, insights and the alerts themselves. */
  metrics_sweep: CoverageLane;
  /** The LLM narrative. Commentary on top of the above, not the product. */
  daily_analysis: CoverageLane;
  /** Milliseconds of the run's budget still unspent when it finished. */
  budget_left_ms: number;
};

export type CoverageVerdict = {
  status: "operational" | "degraded";
  /** Human sentence, or "" when there is nothing to add. */
  detail: string;
};

/*
  A run that ends with less than this much budget to spare is already
  truncating, or one slow night away from it. Chosen to match the cron's own
  guard: the sweep loop refuses to start a batch of five without 3,000ms, and
  the analysis loop refuses to start a model call without 9,000ms. A run
  finishing under 15,000ms has been skipping work at the tail for a while.
*/
export const BUDGET_FLOOR_MS = 15_000;

/**
 * Nights to cover every workspace in a lane at the throughput last observed.
 *
 * `null` means "never at this rate" — total work outstanding and nothing
 * getting done, which is a different and worse state than "slowly".
 */
export function nightsForFullCycle(lane: CoverageLane): number | null {
  const total = Math.max(0, Math.floor(lane.total || 0));
  if (total === 0) return 1; // nothing to cover; a cycle completes trivially

  /*
    THROUGHPUT IS MEASURED, NOT ASSUMED.

    ceil(total / cap) is the optimistic answer — it presumes every run gets
    through its whole allowance. Using what the last run actually finished
    means a cron that is quietly being cut short by the time budget reports
    three nights rather than one, which is the true figure a customer would
    experience.

    `cap` is the fallback only when nothing was done AND the cap is positive,
    which happens on a lane whose total is zero-filtered — never on a lane with
    outstanding work.
  */
  const done = Math.max(0, Math.floor(lane.done || 0));
  const throughput = done > 0 ? done : 0;
  if (throughput <= 0) return null;

  return Math.max(1, Math.ceil(total / throughput));
}

/**
 * Turn a coverage record into the verdict the status page shows.
 *
 * `null` coverage is NOT degraded. A deploy that predates this feature, or the
 * window between deploying and the first nightly run, would otherwise paint the
 * status page yellow for a reason that resolves itself — and a check that cries
 * wolf on day one is a check nobody reads on day ninety. The genuinely
 * dangerous case, a cron not running at all, is already caught by the heartbeat
 * age test that calls this one.
 */
export function coverageVerdict(c: CronCoverage | null | undefined): CoverageVerdict {
  if (!c) return { status: "operational", detail: "coverage not yet reported" };

  const sweepNights = nightsForFullCycle(c.metrics_sweep);
  const analysisNights = nightsForFullCycle(c.daily_analysis);
  const reasons: string[] = [];

  /*
    THE SWEEP IS THE PRODUCT.

    recomputeMetrics is what produces health_metrics, insights and alerts — the
    early warning a customer pays for. If it takes two nights to come round,
    every warning is up to 48 hours late, and "we watch your numbers daily" has
    stopped being true. That is a degradation whatever the cause.
  */
  if (sweepNights === null) {
    reasons.push(`metrics sweep covered 0 of ${c.metrics_sweep.total} workspaces — warnings are not being refreshed`);
  } else if (sweepNights > 1) {
    reasons.push(`warnings refresh every ${sweepNights} nights (${c.metrics_sweep.total} workspaces at ${c.metrics_sweep.done}/night)`);
  }

  /*
    THE ANALYSIS IS NOT.

    The daily analysis is an LLM-written paragraph on top of numbers that are
    already correct and already delivered. Rotating it over several nights
    costs a customer some prose, not a warning — so it is REPORTED in the
    detail at every scale, and never on its own turns the page yellow. Wiring
    it to `degraded` would light the status page up on the twenty-first
    workspace, which is a success, and teach the operator to ignore the colour.
  */
  const notes: string[] = [];
  if (analysisNights === null) {
    notes.push(`AI commentary reached 0 of ${c.daily_analysis.total} entitled workspaces`);
  } else if (analysisNights > 1) {
    notes.push(`AI commentary every ${analysisNights} nights`);
  }

  /*
    Budget exhaustion is upstream of both lanes: a run that finishes with
    nothing to spare truncates the sweep first, so this usually fires alongside
    the sweep reason. It is stated separately because the FIX is different —
    the sweep reason says "raise the cap", this one says "you cannot, split the
    schedule".
  */
  if (typeof c.budget_left_ms === "number" && c.budget_left_ms < BUDGET_FLOOR_MS) {
    reasons.push(`run finished with only ${Math.max(0, Math.round(c.budget_left_ms / 1000))}s of its time budget left`);
  }

  const all = [...reasons, ...notes];
  return {
    status: reasons.length ? "degraded" : "operational",
    detail: all.length ? all.join("; ") : `full coverage nightly (${c.metrics_sweep.total} workspaces)`,
  };
}

/**
 * Parse what the cron wrote. Anything unreadable is treated as absent rather
 * than thrown: a malformed heartbeat row must not take down the status page
 * that exists to tell you the heartbeat is fine.
 */
export function parseCoverage(raw: unknown): CronCoverage | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    const lane = (x: any): CoverageLane => ({
      total: Number(x?.total) || 0,
      done: Number(x?.done) || 0,
      cap: Number(x?.cap) || 0,
    });
    if (!o.metrics_sweep || !o.daily_analysis) return null;
    return {
      at: typeof o.at === "string" ? o.at : "",
      metrics_sweep: lane(o.metrics_sweep),
      daily_analysis: lane(o.daily_analysis),
      budget_left_ms: Number(o.budget_left_ms) || 0,
    };
  } catch {
    return null;
  }
}

/** The system_status key the cron writes and the health check reads. */
export const COVERAGE_KEY = "cron_coverage";
