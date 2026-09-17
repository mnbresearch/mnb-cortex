/**
 * How long a paid period runs, when the customer already has one.
 *
 * Pure arithmetic over numbers so it can be executed by a test. No dates
 * parsed from strings, no database, no plan catalogue — the caller resolves
 * prices and passes them in.
 *
 * THE DEFECT THIS FIXES: a cheap long period upgraded into an expensive one
 * for free.
 *
 * settle.ts stacked periods by TIME: `from = max(existing_ends_at, now)`, then
 * added the new cycle's days and set `plan` to the new plan. Stacking is right
 * for a renewal — somebody buying next month early must not lose the rest of
 * this month. But the plan name was overwritten while the carried days were
 * not revalued, so:
 *
 *   Buy Try annual      ₹7,990  → 365 days of Try
 *   Buy Command monthly ₹39,999 → plan becomes Command, ends_at becomes day 395
 *
 * ₹47,989 buys thirteen months of Command, which lists at ₹39,999 a month. The
 * 365 carried days were bought at Try's price and are now being honoured at
 * Command's. The old comment only considered same-plan renewals, which is why
 * the hole was invisible: the code was correct for the case its author had in
 * mind.
 *
 * THE RULE: carry VALUE, not days.
 *
 * Remaining days on the old plan are worth what was paid for them. Converted
 * into the new plan they buy proportionally fewer days:
 *
 *   carried = remaining × (old price per day ÷ new price per day)
 *
 * Try annual is ₹21.89/day, Command monthly is ₹1,333.30/day, so 365 days of
 * remaining Try carries into 5 days of Command (5.99, floored). ₹39,999 then
 * buys its 30, for 35 days total — which is what ₹47,989 is worth at the prices
 * we publish.
 *
 * A DOWNGRADE runs the same arithmetic the other way and is deliberately left
 * generous: 20 remaining days of Command carries into 1,219 days of Try. That
 * is what the customer paid for, and taking it away to avoid an unusually long
 * Try period would be confiscating value they already own. A downgrade is also
 * a customer trying to spend less with us, which is not a moment to shortchange
 * them.
 *
 * SAME PLAN: plain stacking, unchanged. No revaluation is possible or needed.
 *
 * UNKNOWN PRICES (a plan whose price we cannot resolve — a signup default or a
 * hand-set value that is not in the catalogue): carry the days as-is, exactly
 * as before, and return a `note`. Guessing a price would be worse than the
 * honest previous behaviour, but carrying silently would leave the free-upgrade
 * hole open with no signal, so settle.ts raises an operator alert on that note.
 * If nothing reads it, this fallback IS the bug.
 */

export type PeriodDecision = {
  /** ms timestamp the new period starts from. */
  from: number;
  /** ms timestamp the new period ends. */
  endsAt: number;
  /** Days carried over from the previous plan, after revaluation. */
  carriedDays: number;
  /** Days the new payment itself buys. */
  boughtDays: number;
  /** True when a plan change was revalued rather than simply stacked. */
  revalued: boolean;
  /** Set when prices were unavailable and days were carried unrevalued. */
  note?: string;
};

export function nextPeriod(args: {
  now: number;
  /** ms timestamp of the current paid period's end, or 0/undefined if none. */
  existingEndsAt?: number;
  /** Days the new payment buys (30 or 365). */
  boughtDays: number;
  /** The plan id the workspace is on now, lowercased. Empty if none. */
  priorPlan?: string;
  /** The plan id being bought. */
  newPlan: string;
  /** Price per day of the prior plan's current cycle. 0/undefined if unknown. */
  priorPricePerDay?: number;
  /** Price per day of the plan being bought. 0/undefined if unknown. */
  newPricePerDay?: number;
}): PeriodDecision {
  const now = args.now;
  const bought = Math.max(0, Math.floor(args.boughtDays));
  const existing = Number(args.existingEndsAt || 0);
  const remainingMs = Math.max(0, existing - now);
  const remainingDays = remainingMs / 86_400_000;

  /* Nothing left to carry: the period simply starts now. */
  if (remainingDays <= 0) {
    return { from: now, endsAt: now + bought * 86_400_000, carriedDays: 0, boughtDays: bought, revalued: false };
  }

  const samePlan = String(args.priorPlan || "").toLowerCase() === String(args.newPlan || "").toLowerCase();
  if (samePlan) {
    /* A renewal. Stack it — this is the case the original code was written for
       and it was right. */
    return { from: existing, endsAt: existing + bought * 86_400_000, carriedDays: remainingDays, boughtDays: bought, revalued: false };
  }

  const oldRate = Number(args.priorPricePerDay || 0);
  const newRate = Number(args.newPricePerDay || 0);
  if (!(oldRate > 0) || !(newRate > 0)) {
    return {
      from: existing, endsAt: existing + bought * 86_400_000,
      carriedDays: remainingDays, boughtDays: bought, revalued: false,
      note: "prices unavailable for one of the plans, so remaining days were carried at face value",
    };
  }

  /* Carry value. Round DOWN to whole days on the carried part: a part-day of a
     plan is not usable, and rounding a fraction up would be giving away a day
     of the more expensive plan on every upgrade. */
  const carried = Math.floor((remainingDays * oldRate) / newRate);
  const from = now + carried * 86_400_000;
  return {
    from, endsAt: from + bought * 86_400_000,
    carriedDays: carried, boughtDays: bought, revalued: true,
  };
}

/** A plan's price for one day of the given cycle. */
export function pricePerDay(plan: { monthly: number; annual: number } | null | undefined, cycle: string | null | undefined): number {
  if (!plan) return 0;
  const annual = String(cycle || "").toLowerCase() === "annual";
  const price = Number(annual ? plan.annual : plan.monthly) || 0;
  const days = annual ? 365 : 30;
  return price > 0 ? price / days : 0;
}
