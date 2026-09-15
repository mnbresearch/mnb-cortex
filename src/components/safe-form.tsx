"use client";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  isControlFlowException, isActionResult, messageForThrown, type FormAction,
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
  action, children, className, successMessage, id,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  /** Shown briefly on success. Omit for forms whose result is self-evident. */
  successMessage?: string;
  id?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);

  async function run(fd: FormData) {
    setError(null);
    setDone(null);
    try {
      const result = await action(fd);
      if (isActionResult(result) && result.ok === false) {
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
      announce(setError, messageForThrown(e), noteRef);
    }
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
            <span>{error}</span>
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
