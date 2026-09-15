"use client";
import { useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import {
  isControlFlowException, isActionResult, messageForThrown, classifyFailure,
  UNREACHED_RETRYABLE, UNREACHED_CHECK_FIRST, type FormAction,
} from "@/lib/action-result";

/*
  A FORM THAT SAYS WHAT WENT WRONG, WHERE IT WENT WRONG.

  Replaces `<form action={serverAction}>` everywhere a person can make a
  mistake we should tell them about. See lib/action-result.ts for the evidence
  that the previous behaviour was unusable in production; briefly:

    - a thrown message is masked by Next and never seen;
    - a throw unmounts the page, so whatever was typed is lost;
    - and a TRANSPORT failure — a 503, a dropped mobile connection, a Vercel
      cold start timing out — produces nothing at all. The submit button stops
      spinning and the page sits there unchanged. I hit this myself on the
      compliance form: two saves failed with 503 and looked exactly like two
      saves that had worked.

  That third one is the reason this wraps the call rather than relying on the
  error boundary. A boundary only sees exceptions that reach the server and
  come back; it cannot see a request that never arrived.

  Three properties this has to keep:

    1. NOTHING TYPED IS LOST. The form is never unmounted, so a failed save
       leaves every field exactly as it was and the person can fix one word and
       resubmit. This is the whole point.

    2. REDIRECTS STILL REDIRECT. `redirect()` and `notFound()` signal by
       throwing. Catching those would silently break sign-out and every
       navigate-on-success form. They are rethrown untouched — and the two
       forms whose entire purpose is to navigate are deliberately left on plain
       <form> anyway, so this guard is the second line, not the only one.

    3. SCREEN READERS ARE TOLD. The message is role="alert" in an aria-live
       region, and focus moves to it, because a visual red box below the fold
       is not feedback for someone who cannot see it. Without the focus move,
       a keyboard user submits and hears nothing.
*/
export function SafeForm({
  action, children, className, successMessage, id, repeatable = false,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  /** Shown briefly on success. Omit for forms whose result is self-evident. */
  successMessage?: string;
  id?: string;
  /*
    Does running this action twice leave the same result?

    Declared per call site because only the call site knows, and DEFAULTS TO
    FALSE because the cost of being wrong is asymmetric: a missed retry button
    is a small inconvenience, a retry on an INSERT is a duplicate invoice in
    somebody's receivables. See the classification in lib/action-result.ts —
    single-row updates, upserts and deletes qualify; anything that inserts a
    business row does not.
  */
  repeatable?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  /*
    Held so Try again can resend exactly what was sent, rather than re-reading
    the form. Re-reading would be subtly wrong: the fields may have been
    re-rendered or cleared between the failure and the click, and resending
    something different from what failed is not a retry.
  */
  const lastSubmission = useRef<FormData | null>(null);
  const [retrying, startTransition] = useTransition();

  async function run(fd: FormData) {
    setError(null);
    setDone(null);
    setCanRetry(false);
    lastSubmission.current = fd;
    try {
      const result = await action(fd);
      if (isActionResult(result) && result.ok === false) {
        /*
          A returned failure means the action RAN and decided against it —
          blank field, plan cap, wrong cadence. Retrying the identical
          submission would produce the identical refusal, so no retry here;
          the person has to change something first.
        */
        announce(setError, result.error, noteRef);
        return;
      }
      if (successMessage) setDone(successMessage);
    } catch (e) {
      /*
        Rethrow before doing anything else. An `await` or a setState between
        the catch and the rethrow would be a race against the navigation Next
        is already performing.
      */
      if (isControlFlowException(e)) throw e;

      if (classifyFailure(e) === "unreached") {
        setCanRetry(repeatable);
        announce(setError, repeatable ? UNREACHED_RETRYABLE : UNREACHED_CHECK_FIRST, noteRef);
        return;
      }
      /*
        It reached us and threw. No retry offered even when the action is
        repeatable: a server-side throw is the case where a write may have
        partially committed, and "press this again" is the worst advice we
        could give in front of that.
      */
      announce(setError, messageForThrown(e), noteRef);
    }
  }

  function retry() {
    const fd = lastSubmission.current;
    if (fd) startTransition(() => { void run(fd); });
  }

  return (
    <form id={id} action={run} className={className}>
      {children}
      {/*
        The live region is always mounted, empty when there is nothing to say.
        A region that appears at the same moment its content does is announced
        unreliably — assistive technology has to be watching the node before
        the text arrives.
      */}
      <div ref={noteRef} tabIndex={-1} aria-live="assertive" className="contents">
        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
          >
            <AlertTriangle aria-hidden="true" className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span>{error}</span>
              {/*
                Only rendered for a failure we have no evidence reached the
                server, on an action whose call site declared a repeat safe.
                Everything else gets the sentence and no button.
              */}
              {canRetry && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={retry}
                    disabled={retrying}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 min-h-9 px-3 text-xs font-medium hover:bg-danger/10 disabled:opacity-60"
                  >
                    <RotateCcw aria-hidden="true" className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
                    {retrying ? "Trying again…" : "Try again"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {done && !error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{done}</span>
          </div>
        )}
      </div>
    </form>
  );
}

/*
  Set the message, then move focus to it on the next frame — after React has
  committed the node, because focusing a container whose child does not exist
  yet moves focus nowhere and the announcement is lost.
*/
function announce(
  set: (v: string) => void,
  message: string,
  ref: React.RefObject<HTMLDivElement>,
) {
  set(message);
  requestAnimationFrame(() => {
    const alert = ref.current?.querySelector<HTMLElement>('[role="alert"]');
    alert?.focus?.();
    alert?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  });
}
