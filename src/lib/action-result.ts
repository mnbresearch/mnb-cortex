/*
  WHAT A FORM IS ALLOWED TO TELL THE PERSON WHO FILLED IT IN.

  THE PROBLEM, MEASURED RATHER THAN ASSUMED.

  lib/actions.ts contains 68 `throw new Error("…")` with carefully written,
  specific, customer-facing wording: "Your company name cannot be empty.",
  "Your plan includes 3 users and you've used 3. Upgrade under Billing to add
  more.", "Nothing is below its reorder level right now, so there's no purchase
  order to draft."

  Not one of them ever reaches a customer.

  I checked this against production rather than reasoning about it. Submitting
  the Settings form with an empty company name produced:

      This page hit an error
      Your data is safe — nothing was changed.
      Reference: 2541004096

  Two separate things went wrong there, and they compound:

    1. NEXT MASKS THROWN ACTION MESSAGES IN PRODUCTION. This is deliberate and
       correct on Next's part — an action's error text can contain connection
       strings, row contents or stack detail, so the client gets a digest and a
       generic string instead. It means the message we wrote is not the message
       anybody sees. Writing a better one changes nothing.

    2. A THROW REPLACES THE WHOLE PAGE. The error boundary unmounts the form.
       Everything typed into it is gone. For a genuine outage that is the right
       response; for "you left the company name blank" it is absurd — the
       customer is shown a support reference number for a typo they could have
       fixed in two seconds if we had simply said so.

  THE DISTINCTION THIS MODULE DRAWS

  An action fails in one of two ways, and they deserve opposite treatments:

    RECOVERABLE — the person can fix it from where they are standing. Empty
      field, bad email, wrong file format, plan cap reached, nothing to act on
      yet, insufficient role. These RETURN `fail("…")`. Returned values are not
      masked, because they are ordinary data rather than an exception, so the
      wording survives to the screen. SafeForm renders it next to the form and
      the form keeps everything that was typed.

    EXCEPTIONAL — the database is unreachable, a constraint we did not
      anticipate fired, a bug. These keep throwing. The boundary, the digest
      and the Vercel log are the right machinery for those, and a customer
      cannot do anything with the detail anyway.

  The rule of thumb when adding a new one: if the sentence you want to write
  begins with "you" or tells them what to do differently, it is recoverable and
  must be returned. If it begins with "could not" and names a subsystem, throw.

  Pure and dependency-free, so scripts/test-action-result.mjs can execute it.
*/

/** A success, optionally with something to say about it. */
export type ActionOk = { ok: true; message?: string };

/** A failure the person can act on, in words we chose and they will see. */
export type ActionFail = { ok: false; error: string };

export type ActionResult = ActionOk | ActionFail;

/**
 * An action that may report a recoverable failure.
 *
 * `void` is included because most actions have no recoverable failure mode and
 * should not be forced to invent one — SafeForm treats "returned nothing" as
 * success, which is exactly what a plain server action already means.
 */
export type FormAction = (fd: FormData) => Promise<ActionResult | void>;

export function ok(message?: string): ActionOk {
  return message ? { ok: true, message } : { ok: true };
}

/**
 * Report a failure the person can fix.
 *
 * Empty and whitespace-only messages are rejected at the type level by
 * requiring the argument, and defended at runtime here: a failure with nothing
 * to say renders as an empty red box, which is worse than the generic message
 * because it looks like the UI is broken rather than the input.
 */
export function fail(error: string): ActionFail {
  const t = (error || "").trim();
  return { ok: false, error: t || FALLBACK_MESSAGE };
}

export const FALLBACK_MESSAGE =
  "That didn't save. Nothing was changed — try again, and if it keeps happening the reference below will tell us why.";

/** Is this a result object at all, as opposed to the `void` most actions return? */
export function isActionResult(v: unknown): v is ActionResult {
  return !!v && typeof v === "object" && "ok" in (v as any) && typeof (v as any).ok === "boolean";
}

/** Did the action report a recoverable failure? */
export function isFailure(v: unknown): v is ActionFail {
  return isActionResult(v) && v.ok === false && typeof (v as any).error === "string";
}

/*
  NEXT'S CONTROL-FLOW EXCEPTIONS ARE NOT ERRORS AND MUST NOT BE CAUGHT.

  `redirect()` and `notFound()` work by throwing. If SafeForm's catch swallowed
  those, `signOut` would stop signing anybody out and the invoice form would
  stop navigating to the invoice it just made — both would instead render a red
  "that didn't save" box under a form that had, in fact, worked perfectly.

  Identified by the `digest` string Next stamps on them, which is the documented
  and only public way to tell them apart from a real error. Matched with
  startsWith because the redirect digest carries the destination URL and status
  after the prefix.
*/
const REDIRECT_DIGEST = "NEXT_REDIRECT";
const NOT_FOUND_DIGEST = "NEXT_NOT_FOUND";

export function isControlFlowException(e: unknown): boolean {
  const d = (e as any)?.digest;
  if (typeof d !== "string") return false;
  return d.startsWith(REDIRECT_DIGEST) || d === NOT_FOUND_DIGEST;
}

/**
 * What to show for an exception that got through.
 *
 * Deliberately does NOT use `e.message`. In production that string is Next's
 * own masked placeholder ("An error occurred in the Server Components render…
 * A digest property is included…"), which is longer than this sentence, says
 * nothing a customer can use, and reads like a crash report. In development it
 * is the real message, which is useful to a developer and meaningless to a
 * customer — and showing different text in the two environments would mean the
 * thing I test is not the thing that ships.
 *
 * The digest is appended when present, because that is the one part a customer
 * can usefully quote at us.
 */
export function messageForThrown(e: unknown): string {
  const d = (e as any)?.digest;
  return typeof d === "string" && d
    ? `${FALLBACK_MESSAGE} Reference: ${d}`
    : FALLBACK_MESSAGE;
}

/*
  ============================================================================
  DID IT REACH US? — and the reason that question decides whether to offer
  a retry button rather than just a nicer sentence.
  ============================================================================

  I hit this live: two saves on the compliance form returned 503 during a
  deploy and produced nothing at all. The fix in the previous commit made that
  visible, but the sentence it shows is the generic "that didn't save", which
  leaves the person to guess what to do next.

  The obvious improvement — a Try again button — is unsafe by default, and
  this codebase has already paid for that lesson: form-buttons.tsx exists
  because "Add invoice" pressed twice inserted the invoice twice. A retry is
  the same double submission with a friendlier label.

  So two judgements have to be made, and they are different judgements.

  FIRST: did the request reach the server?

  `digest` is the signal. Next stamps it on errors that were thrown INSIDE a
  server action and serialised back, so its presence means the action ran. Its
  absence means the failure happened before any response we can read — a dead
  connection, a 503 HTML page from the edge, a function that never booted.

  This is a strong signal but NOT a proof, and the wording downstream must not
  pretend otherwise: a function can 503 after its INSERT has committed. So
  "unreached" means "we have no evidence it landed", never "nothing happened".

  SECOND: if it did not land, is repeating it safe?

  That cannot be inferred here — it is a property of each action, so each call
  site declares it (see SafeForm's `repeatable`). The rule:

    REPEATABLE — the action converges on the same state however many times it
      runs. A single-row UPDATE keyed by the org, an UPSERT, a DELETE by id.
      updateOrgProfile, updateStatutoryProfile, saveAlertRule, deleteWebhook
      and deleteScheduledReport qualify. updateStatutoryProfile also writes
      one row to `activity` via logActivity, so a repeat leaves a duplicate
      audit line — noise in a log, not damage to a business record, which is
      why it still qualifies. Being precise about that is the point: "safe to
      repeat" is a claim about the customer's data, not a claim of perfect
      idempotence.

    NOT REPEATABLE — anything that INSERTs a business row. inviteMember,
      addLead, saveGoal, addWebhook, addScheduledReport, generatePO,
      sendReminderAI, runWorkflow, convertLead, updateStatus. These get told
      to reload and check first, because the one scenario where a retry does
      real harm is precisely the one we cannot rule out.
*/
export type FailureKind = "unreached" | "server";

export function classifyFailure(e: unknown): FailureKind {
  const d = (e as any)?.digest;
  return typeof d === "string" && d ? "server" : "unreached";
}

/** No evidence it arrived, and repeating it converges on the same state. */
export const UNREACHED_RETRYABLE =
  "That didn't reach us — it may be your connection, or a hiccup on our side. Nothing you typed has been lost.";

/**
 * No evidence it arrived, but a repeat could duplicate a record.
 *
 * The wording has to carry real uncertainty without being alarming, and it
 * must not tell them it is safe to press again — that is the one instruction
 * that could cost them a duplicate invoice.
 */
export const UNREACHED_CHECK_FIRST =
  "That didn't reach us, so it most likely didn't save — but we can't be certain. Reload the page and check before sending it again, in case it did go through.";
