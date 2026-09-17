/**
 * What a refund should reverse. Pure arithmetic, no database, no network.
 *
 * WHY THIS IS ITS OWN FILE.
 *
 * The old handler decided nothing — it reversed everything, always. Now there
 * is a real decision with real money on both sides of it, and a decision that
 * can be executed by a test is worth more than one buried in two database
 * round-trips. Every rule below can be mutated and proved.
 *
 * THE DEFECT THIS REPLACES.
 *
 * `handleRefundEvent` never read the refund amount. Any refund event revoked
 * the entire entitlement: a ₹1 goodwill adjustment on the ₹8,999 pack took all
 * 10,000 credits; a ₹1 adjustment on the ₹39,999 annual plan removed 365 days.
 * Cashfree's own mandate-authorisation reversal is a ₹1 refund, so this was not
 * a hypothetical edge — it is a normal event in the subscription flow.
 *
 * THE RULE.
 *
 * A refund reverses its own share and nothing more. ₹500 back on a ₹8,000
 * purchase reverses 6.25% of what that purchase bought. Repeated partials
 * accumulate against the total, so three ₹500 refunds reverse 18.75% and never
 * more than the whole.
 *
 * TWO ASYMMETRIES ARE DELIBERATE, and both lean the same way — towards not
 * taking product from someone who paid for it:
 *
 *   Rounding goes DOWN (floor), for credits AND for days. Reversing 6.25% of
 *   10,000 credits takes 625; 6.25% of 10,001 takes 625, not 626; 6.25% of a
 *   30-day cycle takes 1 day, not 2. The remainder stays with the customer.
 *   Over a full refund it makes no difference, because a full refund is
 *   detected by amount and reverses the remainder exactly.
 *
 *   An UNKNOWN amount reverses NOTHING and says so. The tempting default is
 *   "treat it as full" — but an unparsed field is not evidence of a full
 *   refund, and acting on it would take an entire annual plan away on the
 *   strength of a field name changing. The honest outcome is to record the
 *   event, reverse nothing, and put it in front of a human. That is the one
 *   case where a person must decide.
 */

export type RefundPlan = {
  /** How much of this purchase this event reverses, 0…1. */
  share: number;
  /** True when this refund (with anything refunded earlier) settles the whole amount. */
  full: boolean;
  /** Refuse to act automatically; a human decides. */
  needsHuman: boolean;
  /** Cumulative refunded amount after this event, for the payment row. */
  refundedTotal: number;
  /** Human-readable, and written into the operator alert. */
  why: string;
};

/** A paisa. Below this, two rupee amounts are the same amount. */
const EPS = 0.01;

export function planRefund(args: {
  /** What the customer originally paid, from our own payments row. */
  paid: number;
  /** What this event says is being refunded. null/NaN when we could not read it. */
  refundAmount: number | null;
  /** Already refunded against this payment before this event. */
  refundedSoFar: number;
  /** Chargebacks and disputes pull the whole payment by nature. */
  isDispute?: boolean;
}): RefundPlan {
  const paid = Number(args.paid);
  const soFar = Math.max(0, Number(args.refundedSoFar) || 0);
  const amount = args.refundAmount === null ? NaN : Number(args.refundAmount);

  if (!(paid > 0)) {
    /* No amount on our own row: we cannot compute a share of an unknown whole.
       A dispute still means the money is gone, so reverse in full; a refund we
       cannot size goes to a human. */
    return args.isDispute
      ? { share: 1, full: true, needsHuman: false, refundedTotal: soFar, why: "dispute on a payment with no recorded amount — reversed in full" }
      : { share: 0, full: false, needsHuman: true, refundedTotal: soFar, why: "our payment row has no amount, so the refund's share cannot be computed" };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    /*
      A DISPUTE with no readable amount is still treated as full: a chargeback
      takes the payment, and the provider is not asking our permission. A REFUND
      with no readable amount is not: it is far more likely to be a partial we
      failed to parse than a full one, and guessing wrong here confiscates a
      plan somebody paid for.
    */
    if (args.isDispute) {
      return { share: remainingShare(paid, soFar), full: true, needsHuman: false, refundedTotal: paid,
        why: "dispute with no readable amount — a chargeback takes the whole payment" };
    }
    return { share: 0, full: false, needsHuman: true, refundedTotal: soFar,
      why: "the event carried no readable refund amount — reversing nothing until a human decides" };
  }

  /* More than what is left is not an error worth refusing over — it happens
     when a provider refunds gross of a fee. Cap it at the remainder. */
  const remaining = Math.max(0, paid - soFar);
  const applied = Math.min(amount, remaining);
  const refundedTotal = Math.min(paid, soFar + amount);
  const full = refundedTotal + EPS >= paid;

  if (applied <= 0) {
    return { share: 0, full: true, needsHuman: false, refundedTotal,
      why: `already refunded in full (₹${round2(soFar)} of ₹${round2(paid)})` };
  }

  return {
    share: full ? remainingShare(paid, soFar) : applied / paid,
    full,
    needsHuman: false,
    refundedTotal,
    why: full
      ? `full refund (₹${round2(refundedTotal)} of ₹${round2(paid)})`
      : `partial refund: ₹${round2(applied)} of ₹${round2(paid)} (${(applied / paid * 100).toFixed(1)}%)`,
  };
}

/** The share still un-reversed, so a final partial completes the whole exactly. */
function remainingShare(paid: number, soFar: number): number {
  return Math.max(0, Math.min(1, (paid - soFar) / paid));
}

/**
 * Credits to reclaim for a share of a grant.
 *
 * Floors, per the asymmetry above, EXCEPT on a full refund where the whole
 * grant goes back — otherwise a 1/3 + 1/3 + 1/3 sequence of partials would
 * leave the customer a credit or two for free, and more importantly a full
 * refund would leave them holding some.
 */
export function creditsToReclaim(granted: number, plan: RefundPlan, alreadyReclaimed = 0): number {
  const g = Math.max(0, Math.floor(Number(granted) || 0));
  const done = Math.max(0, Math.floor(Number(alreadyReclaimed) || 0));
  if (plan.full) return Math.max(0, g - done);
  return Math.max(0, Math.min(g - done, Math.floor(g * plan.share)));
}

/**
 * Days to remove from a paid period for a share of it.
 *
 * FLOORS, like the credit reclaim, and for the same reason. An earlier version
 * used Math.round here while the file's own header promised that rounding
 * always favours the customer — so a 1.7% refund removed a whole day of a
 * monthly plan, and the comment describing the behaviour was wrong about the
 * line below it. Rounding is not a detail when the thing being rounded is
 * somebody's access to a product they paid for.
 *
 * `alreadyRemoved` is what earlier partial refunds against this same payment
 * have already taken. Without it, a full refund after two partials removed the
 * whole cycle again — the partials' days came off twice.
 */
export function daysToRemove(cycleDays: number, plan: RefundPlan, alreadyRemoved = 0): number {
  const d = Math.max(0, Math.floor(Number(cycleDays) || 0));
  const done = Math.max(0, Math.floor(Number(alreadyRemoved) || 0));
  if (plan.full) return Math.max(0, d - done);
  return Math.max(0, Math.min(d - done, Math.floor(d * plan.share)));
}

/** Days in a cycle. The only two cycles this product sells. */
export function cycleDays(cycle: string | null | undefined): number {
  return String(cycle || "").toLowerCase() === "annual" ? 365 : 30;
}

/**
 * The days a payment bought, expressed in the plan the workspace is on NOW.
 *
 * WHY THIS IS NOT JUST cycleDays().
 *
 * A plan change revalues the remaining period (see lib/pay/period.ts): 30 days
 * of Command, downgraded to Try, become about 1,500 days of Try, because that
 * is what the money is worth at Try's price. Refunding the Command payment with
 * a flat `cycleDays("monthly")` removes 30 of those 1,500 days and leaves the
 * customer four years of a plan they were refunded for.
 *
 * The same conversion in reverse keeps it symmetric: whatever a payment's days
 * became worth, that is what a refund of it takes back.
 *
 * Both rates unknown → fall back to the payment's own cycle, which is the old
 * behaviour and is correct whenever the plan has not changed.
 */
export function equivalentDays(args: {
  paidCycleDays: number;
  paidPricePerDay?: number;
  currentPricePerDay?: number;
}): number {
  const days = Math.max(0, Math.floor(Number(args.paidCycleDays) || 0));
  const from = Number(args.paidPricePerDay || 0);
  const to = Number(args.currentPricePerDay || 0);
  if (!(from > 0) || !(to > 0) || from === to) return days;
  return Math.max(0, Math.floor((days * from) / to));
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
