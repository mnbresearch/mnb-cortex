/**
 * Whether a reminder may leave — decided in one pure place.
 *
 * WHY THIS WAS EXTRACTED.
 *
 * Every guard in this product's highest-consequence path lived inside the body
 * of sendApproved(), interleaved with Supabase calls. The logic was careful and,
 * as far as I can tell, correct — but it could not be executed by a test,
 * because reaching it needs a service-role client, a live database and a real
 * email or WhatsApp provider.
 *
 * So scripts/test-collections-safety.mjs did the only thing available to it: it
 * read sendApproved's SOURCE as a string and asserted that certain phrases
 * appeared in it. That will happily pass while the guards are in the wrong
 * order, or unreachable, or checking a field that is always undefined. It tells
 * you the code says the right words, not that it does the right thing.
 *
 * This module is the decision, and nothing else. No I/O, no imports, no clock
 * of its own — `now` is always passed in. sendApproved() calls it, and
 * scripts/test-collections-engine.mjs runs every scenario through it directly:
 * paid before send, paid after the draft was written, attempt cap, a
 * do-not-contact entry added after drafting, the minimum gap, quiet hours, the
 * daily ceiling, the platform kill switch, and the circuit breaker.
 *
 * The rule for changing anything here: if a guard cannot be expressed as a pure
 * function of (policy, thread, message, now), it does not belong in this file —
 * and if it is in this file it must have a test that fails when it is deleted.
 */

import type { Policy } from "@/lib/collections-shared";

/**
 * Corporate suffixes, for do-not-contact matching ONLY.
 *
 * THE BUG THIS FIXES, found by running the new engine suite:
 * normalizeCustomerName() canonicalises suffix SPELLING — "private limited"
 * becomes "pvt ltd" — but it does not remove the suffix. So
 *
 *     "Kirloskar Distributors"          -> "kirloskar distributors"
 *     "Kirloskar Distributors Pvt Ltd"  -> "kirloskar distributors pvt ltd"
 *
 * never matched each other. An owner who typed the registered name into the
 * do-not-contact list while the invoice carried the trading name — or the
 * reverse — got no protection at all, silently. That is precisely the "I told
 * it not to contact them and it did" incident the list exists to prevent.
 *
 * WHY NOT FIX THE SHARED NORMALISER. Because it also resolves customer
 * IDENTITY across the product — linking orders and invoices to a customer row.
 * Stripping suffixes there would make "Acme Ltd" and "Acme LLP" the same
 * customer and silently merge two companies' ledgers, which is a worse bug
 * than the one being fixed.
 *
 * SO THIS IS DELIBERATELY ASYMMETRIC, and only here. Matching loosely can
 * block a reminder the owner did not mean to block: they notice, and the
 * reason is on the message. Matching strictly chases someone the owner
 * explicitly protected. Those costs are not comparable, so this errs towards
 * not sending.
 */
const NAME_SUFFIXES = new Set([
  "pvt", "ltd", "llp", "inc", "llc", "plc", "co", "corp", "gmbh", "bv", "srl", "sa",
  "enterprises", "enterprise", "industries", "group", "holdings", "and", "the",
]);

/** The name as given, and the name with corporate suffix tokens removed. */
function suffixVariants(normalised: string): string[] {
  const toks = normalised.split(" ").filter(Boolean);
  const bare = toks.filter((t) => !NAME_SUFFIXES.has(t));
  /* If a name is ONLY suffixes, keep it as-is rather than collapsing to "". */
  if (!bare.length || bare.join(" ") === normalised) return [normalised];
  return [normalised, bare.join(" ")];
}

/* ------------------------------------------------------------------ gate */

export type RunGate = {
  /** False when nothing may be sent on this run at all. */
  allowed: boolean;
  /** How many messages this run may send. 0 whenever allowed is false. */
  room: number;
  /** Shown to the operator. Always set when allowed is false. */
  note?: string;
};

/**
 * The run-level checks, in the order they must happen.
 *
 * ORDER IS LOAD-BEARING and is asserted by the tests:
 *
 *   1. platform kill switch — an operator stopping every workspace must win
 *      over any per-workspace setting,
 *   2. the workspace's own switch,
 *   3. quiet hours,
 *   4. the daily ceiling.
 *
 * If the ceiling were checked first, a workspace that had already hit its limit
 * would report "daily limit reached" while collections was globally paused —
 * true, but it would hide the fact that the operator had stopped everything,
 * which is the thing support needs to see.
 *
 * `platformEnabled` is `true` when the switch is on AND when it could not be
 * read. Failing open is deliberate: a database blip must not silently halt
 * every customer's collections with no indication why. The caller is
 * responsible for that coalescing; this function only honours the flag.
 */
export function runGate(args: {
  platformEnabled: boolean;
  policy: Policy;
  sentToday: number;
  now: Date;
  withinWindow: (p: Policy, now: Date) => boolean;
}): RunGate {
  const { platformEnabled, policy, sentToday, now, withinWindow } = args;

  if (!platformEnabled) {
    return {
      allowed: false, room: 0,
      note: "Sending is paused across Cortex right now. Your drafts are safe and will go out once it resumes.",
    };
  }
  if (!policy.enabled) return { allowed: false, room: 0, note: "Collections is switched off." };
  if (!withinWindow(policy, now)) {
    return {
      allowed: false, room: 0,
      note: `Outside your sending window (${policy.send_from_hour}:00–${policy.send_to_hour}:00 IST).`,
    };
  }

  const room = Math.max(0, Number(policy.max_per_day || 0) - Math.max(0, sentToday));
  if (room === 0) {
    return { allowed: false, room: 0, note: `Daily limit of ${policy.max_per_day} already reached.` };
  }
  return { allowed: true, room };
}

/* --------------------------------------------------------------- message */

export type ThreadState = {
  status: string | null;
  attempts: number | null;
  last_sent_at: string | null;
  party: string | null;
};

export type MessageState = {
  recipient: string | null;
  channel: string | null;
};

export type Decision =
  /** Hand it to the provider. */
  | { action: "send" }
  /**
   * Do not send, and do not try again — the reason is permanent for this
   * message. Recorded as cancelled/skipped with the reason attached, never
   * discarded silently.
   */
  | { action: "cancel"; reason: string }
  /** Not sendable now, but not the workspace's fault and not a failure. */
  | { action: "skip"; reason: string };

/**
 * Decide one queued message, at the moment of sending.
 *
 * RE-CHECKED HERE, not just at draft time, and that is the whole point. A queue
 * built on Monday outlives the state it was checked against. Without this:
 *
 *   · an invoice paid after the draft was written still gets chased,
 *   · the attempt cap is bypassed, because five queued messages each passed the
 *     check when there were zero attempts,
 *   · the minimum gap is bypassed, because everything goes out in one run,
 *   · and a party the owner added to do-not-contact AFTER drafting is still
 *     messaged — the "I told it not to contact them and it did" incident.
 *
 * `normalise` is injected so this file stays free of imports and the caller
 * uses the same name-matching the rest of the product uses.
 */
export function decideMessage(args: {
  policy: Policy;
  thread: ThreadState;
  message: MessageState;
  now: Date;
  normalise: (s: string) => string | null;
  /** False when the channel is chosen but not configured for this workspace. */
  channelReady?: boolean;
  channelNotReadyReason?: string;
}): Decision {
  const { policy, thread, message, now, normalise } = args;

  if (!message.recipient || !String(message.recipient).trim()) {
    return { action: "cancel", reason: "No recipient on file" };
  }

  /* Paid wins over everything, including a queue already claimed for sending. */
  if (thread.status === "recovered") return { action: "cancel", reason: "Invoice was paid" };
  if (thread.status === "excluded") return { action: "cancel", reason: "Excluded from collections" };

  if (Number(thread.attempts || 0) >= Number(policy.max_attempts || 0)) {
    return { action: "cancel", reason: `Already sent ${policy.max_attempts} reminders` };
  }

  const partyNorm = thread.party ? normalise(String(thread.party)) : null;
  if (partyNorm) {
    const dncKeys = new Set<string>();
    for (const entry of policy.do_not_contact || []) {
      const n = normalise(String(entry));
      if (n) for (const k of suffixVariants(n)) dncKeys.add(k);
    }
    if (suffixVariants(partyNorm).some((k) => dncKeys.has(k))) {
      return { action: "cancel", reason: "Added to your do-not-contact list" };
    }
  }

  if (thread.last_sent_at) {
    const since = now.getTime() - new Date(thread.last_sent_at).getTime();
    if (since < Number(policy.min_gap_days || 0) * 86_400_000) {
      return { action: "cancel", reason: `Last reminder was under ${policy.min_gap_days} days ago` };
    }
  }

  /*
    An unconfigured channel is SKIPPED, never failed.

    A workspace with no Meta account produces a refusal on every run — a
    standing fact, not a transient error. Counting it as a failure guaranteed
    the breaker would trip within a day and switch off the email reminders that
    were working perfectly. See shouldTripBreaker below.
  */
  if (args.channelReady === false) {
    return { action: "skip", reason: args.channelNotReadyReason || "Channel not configured" };
  }

  return { action: "send" };
}

/* --------------------------------------------------------------- breaker */

/**
 * Should this run trip the workspace's own circuit breaker?
 *
 * Only when real attempts failed AND nothing at all got through. The realistic
 * cause is an expired provider token: every send fails, and without tripping,
 * the same messages are re-presented every run, burning the customer's quota to
 * rediscover the same broken credential.
 *
 * `skipped` is excluded on purpose. Ten WhatsApp skips and no sends means "you
 * have not connected WhatsApp", which switching collections off does not fix —
 * it would only also stop the email that works.
 */
export function shouldTripBreaker(r: { sent: number; failed: number; skipped: number }): boolean {
  return r.failed > 0 && r.sent === 0;
}
