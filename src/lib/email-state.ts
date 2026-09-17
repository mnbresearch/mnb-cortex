/**
 * What an email attempt MEANT, and what the probe history says about the
 * service. Pure functions, no network, no database — so both rules can be
 * executed by a test instead of described in a comment.
 *
 * TWO DEFECTS SIT BEHIND THIS FILE, AND THEY ARE NOT THE SAME DEFECT.
 *
 * 1. THE PROBE. checkEmail() did a single GET to api.resend.com/domains with a
 *    6-second ceiling and turned an AbortError straight into
 *
 *        Email: degraded — "no response in 6000ms"   (critical: true)
 *
 *    One slow response — a cold TLS handshake on a fresh serverless instance, a
 *    momentary blip at the provider — is enough. There was no second attempt, no
 *    history, no recorded duration, and no reference to whether real messages
 *    were being delivered at that moment. So the status page and the email
 *    console could disagree completely, and did: the console listed messages
 *    delivered minutes earlier while the status page called the service
 *    critical. When two screens contradict each other, the operator learns to
 *    believe neither.
 *
 * 2. THE SEND PATH. sendEmail() called fetch() with NO timeout at all. Not a
 *    long one — none. A hung connection to Resend hangs the request that is
 *    sending, up to the serverless function's own wall clock, and then the
 *    caller is told `{ sent: false }` — indistinguishable from a refusal, even
 *    though Resend may well have accepted the message. That is the state in
 *    which a naive retry sends the customer a duplicate.
 *
 * THE DISTINCTION THIS FILE EXISTS TO MAKE:
 *
 *   accepted — the provider said yes and gave us an id. The message exists.
 *   rejected — the provider said no, for a reason that will not change
 *              (bad address, unverified domain, invalid key). Retrying is
 *              pointless and, for an auth failure, harmful noise.
 *   unknown  — we never heard back. The message may or may not exist. This is
 *              the state the old code collapsed into "failed", and the one that
 *              decides whether a retry is safe.
 *
 * A retry is safe only when the request carried an idempotency key, or when
 * nothing left the building. Anything else risks sending twice, and sending a
 * debt reminder twice is a real cost to a real person.
 */

export type AttemptOutcome = "accepted" | "rejected" | "unknown";

export type Attempt = {
  outcome: AttemptOutcome;
  /** Safe to try again — see the note above on what "safe" means here. */
  retryable: boolean;
  /** What to record and, where relevant, show the user. */
  reason?: string;
  /** Transport failure with no HTTP response at all. */
  transport: boolean;
};

/**
 * Classify one HTTP attempt against the provider.
 *
 * `status: 0` means no response — a timeout or a socket error. Everything else
 * is a real answer from Resend and is classified by what that answer means for
 * a second attempt.
 */
export function classifyAttempt(args: {
  status: number;
  /** Error name from fetch (AbortError for our own timeout). */
  errorName?: string;
  /** Message from fetch, or the provider's error body. */
  message?: string;
  /** True when the request carried an Idempotency-Key the provider honours. */
  idempotent?: boolean;
}): Attempt {
  const status = Number(args.status) || 0;
  const msg = (args.message || "").slice(0, 300);

  if (status === 0) {
    /*
      NO ANSWER. The single most important case, and the one the old code got
      wrong in both directions: it reported "failed" (so callers told the user
      the email had not been sent, which may be untrue) and some callers then
      retried (which may send twice).

      With an idempotency key a retry is safe, because the provider
      de-duplicates it. Without one it is not, and the honest thing is to leave
      the record as unknown for a human or a reconciliation pass.
    */
    const aborted = args.errorName === "AbortError";
    return {
      outcome: "unknown",
      retryable: Boolean(args.idempotent),
      transport: true,
      reason: aborted
        ? `no response from the email provider within the timeout${args.idempotent ? " — safe to retry, the request carried an idempotency key" : ""}`
        : `could not reach the email provider: ${msg || "network error"}`,
    };
  }

  if (status >= 200 && status < 300) {
    return { outcome: "accepted", retryable: false, transport: false };
  }

  if (status === 401 || status === 403) {
    /* The key is wrong or revoked. Retrying cannot fix it and every retry is
       another line of noise on top of a real outage. */
    return { outcome: "rejected", retryable: false, transport: false,
      reason: `the email provider rejected our credentials (HTTP ${status}). ${msg}`.trim() };
  }

  if (status === 429) {
    /* Rate limited. The provider is telling us to come back — that is an
       instruction, not a failure, and it is the clearest retryable case there
       is. Nothing was sent, so a retry cannot duplicate. */
    return { outcome: "rejected", retryable: true, transport: false,
      reason: `rate limited by the email provider${msg ? `: ${msg}` : ""}` };
  }

  if (status >= 500) {
    /*
      The provider's own failure. A 5xx usually means it did not accept the
      message — but "usually" is doing a lot of work, so this is only retried
      when the request was idempotent. Without a key we record it and stop.
    */
    return {
      outcome: args.idempotent ? "unknown" : "rejected",
      retryable: Boolean(args.idempotent),
      transport: false,
      reason: `the email provider returned HTTP ${status}${msg ? `: ${msg}` : ""}`,
    };
  }

  /* 4xx that is not auth or rate limiting: a bad address, an unverified
     sending domain, a malformed payload. These are ours to fix, not to retry. */
  return { outcome: "rejected", retryable: false, transport: false,
    reason: `the email provider refused the message (HTTP ${status})${msg ? `: ${msg}` : ""}` };
}

export type ProbeSample = { ok: boolean; ms: number; status: number; at: number; error?: string };

export type ProbeVerdict = {
  status: "operational" | "degraded" | "down";
  detail: string;
  /** How old the newest evidence is, in ms. The point of the whole exercise. */
  ageMs: number;
  /** True when the verdict rests on real deliveries rather than on the probe. */
  fromDeliveries: boolean;
};

/**
 * Turn probe history and recent real sends into one honest verdict.
 *
 * THE RULES, and why each one is here:
 *
 *   A REAL SEND BEATS A PROBE. If the provider accepted one of our actual
 *   messages in the last few minutes, the service works, whatever a GET to
 *   /domains did. This is what removes the contradiction between the status
 *   page and the email console — the console was right, because it was looking
 *   at real deliveries.
 *
 *   ONE FAILED PROBE IS NOT AN OUTAGE. It takes two consecutive failures to
 *   report degraded. A single 6-second blip flipping a critical dependency is
 *   the false alarm that started all this.
 *
 *   REJECTED CREDENTIALS ARE AN OUTAGE IMMEDIATELY. A 401 is not a blip; it
 *   does not heal, and every send until somebody fixes the key is lost.
 *
 *   NO RECENT EVIDENCE IS NOT GOOD NEWS, AND NOT BAD NEWS EITHER. If the
 *   newest sample is older than the staleness window, the verdict is degraded
 *   with "not measured recently" — never operational (that would be a guess
 *   presented as a fact) and never down (we have not observed a failure).
 */
export function probeVerdict(args: {
  /** Newest first. */
  probes: ProbeSample[];
  /** Provider-accepted sends, newest first, as timestamps. */
  acceptedSends: number[];
  /** Real sends the provider REFUSED, newest first. */
  rejectedSends: number[];
  now: number;
  /** Evidence older than this is not evidence about now. */
  staleAfterMs?: number;
  /** A real send within this window outweighs a failed probe. */
  deliveryWindowMs?: number;
}): ProbeVerdict {
  const now = args.now;
  const stale = args.staleAfterMs ?? 10 * 60_000;
  const deliveryWindow = args.deliveryWindowMs ?? 15 * 60_000;
  const probes = (args.probes || []).filter((p) => p && Number.isFinite(p.at));
  const newestProbe = probes[0];
  const accepted = (args.acceptedSends || []).filter((t) => now - t <= deliveryWindow);
  const rejected = (args.rejectedSends || []).filter((t) => now - t <= deliveryWindow);

  /* Credentials first: it is the one answer that is conclusive on its own. */
  const authFail = probes.slice(0, 2).find((p) => p.status === 401 || p.status === 403);
  if (authFail) {
    return {
      status: "down",
      detail: `the provider rejected our API key (HTTP ${authFail.status}) — every email is failing until it is replaced`,
      ageMs: now - authFail.at,
      fromDeliveries: false,
    };
  }

  if (accepted.length > 0) {
    const ageMs = now - accepted[0];
    const probeNote = newestProbe && !newestProbe.ok
      ? ` (the API probe timed out at ${newestProbe.ms}ms, but real mail is going out, so the probe is the unreliable half)`
      : "";
    return {
      status: rejected.length > accepted.length ? "degraded" : "operational",
      detail: `${accepted.length} message(s) accepted by the provider in the last ${Math.round(deliveryWindow / 60_000)} minutes, most recently ${Math.round(ageMs / 1000)}s ago${probeNote}`,
      ageMs,
      fromDeliveries: true,
    };
  }

  if (!newestProbe) {
    return { status: "degraded", detail: "not measured yet — no probe has run since this instance started", ageMs: Infinity, fromDeliveries: false };
  }

  const ageMs = now - newestProbe.at;
  if (ageMs > stale) {
    /*
      THE STALENESS RULE. A failure from an hour ago is not a statement about
      now, and this is exactly what the audit asked for: a bounded recent
      probe rather than a snapshot of an old failure. Reporting it as
      operational would be worse — that is a guess dressed as a measurement.
    */
    return {
      status: "degraded",
      detail: `not measured in the last ${Math.round(stale / 60_000)} minutes (newest sample is ${Math.round(ageMs / 60_000)} minutes old) — this reports our monitoring, not the provider`,
      ageMs, fromDeliveries: false,
    };
  }

  if (newestProbe.ok) {
    return { status: "operational", detail: `provider answered in ${newestProbe.ms}ms`, ageMs, fromDeliveries: false };
  }

  const second = probes[1];
  const twoInARow = second && !second.ok && now - second.at <= stale * 2;
  if (!twoInARow) {
    /*
      ONE FAILURE IS A BLIP. Reported, with the number, but not as a fault:
      "degraded" on a single 6-second timeout is the false alarm this rule
      exists to prevent, and the status is `critical`, so it colours the whole
      page.
    */
    return {
      status: "operational",
      detail: `one probe failed (${newestProbe.error || `HTTP ${newestProbe.status}`} after ${newestProbe.ms}ms) and has not repeated — recorded, not treated as an outage`,
      ageMs, fromDeliveries: false,
    };
  }

  return {
    status: "degraded",
    detail: `two consecutive probes failed (${newestProbe.error || `HTTP ${newestProbe.status}`}) — mail may be delayed`,
    ageMs, fromDeliveries: false,
  };
}
