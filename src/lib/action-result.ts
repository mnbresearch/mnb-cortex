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
