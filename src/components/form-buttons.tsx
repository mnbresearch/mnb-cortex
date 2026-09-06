"use client";
import { useFormStatus } from "react-dom";
import { useEffect, useState } from "react";
import { Trash2, Sparkles, Loader2 } from "lucide-react";

/*
  THE SUBMIT BUTTONS THAT KNOW WHETHER THEY ARE BUSY.

  Every form in this app posted to a server action with a plain <button
  type="submit"> and no pending state. Two consequences, and the first one
  writes bad rows into a customer's ledger:

    1. DOUBLE SUBMISSION. Server actions on a slow Indian mobile connection can
       take a couple of seconds with no visible change on screen. The natural
       response to a button that appears not to have worked is to press it
       again — and "Add invoice" pressed twice inserts the invoice twice. The
       customer then has to notice the duplicate and delete it, and receivables
       totals are wrong until they do.

    2. NO FEEDBACK AT ALL. Nothing indicated that anything was happening, which
       is what made (1) so easy to trigger.

  useFormStatus reads the pending state of the enclosing <form>, so these work
  without any of the ~40 call sites having to manage state.
*/
export function SubmitButton({ children, className, pendingLabel = "Saving…", icon = false }: {
  children: React.ReactNode; className?: string; pendingLabel?: string; icon?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending
        ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> {pendingLabel}</>
        : <>{icon ? <Sparkles aria-hidden="true" className="h-4 w-4" /> : null} {children}</>}
    </button>
  );
}

/*
  DELETE, WITH A SECOND OF DOUBT.

  DeleteButton was a single click that permanently removed a row — an invoice,
  an employee, a saved analysis — with no confirmation and no undo. It also sat
  in the last column of a dense table, next to the row above it, on touch
  targets that are 44px precisely because fingers are imprecise.

  A two-step click rather than a window.confirm(): it stays inside the page's
  own visual language, it is announced properly, and it resets after four
  seconds so an accidental first click does not leave a primed delete sitting
  in the table.
*/
export function DeleteSubmit({ label = "Remove" }: { label?: string }) {
  const { pending } = useFormStatus();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (pending) {
    return (
      <span className="inline-flex min-h-11 min-w-11 items-center justify-center p-1.5 text-muted-foreground" aria-live="polite">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        <span className="sr-only">Deleting…</span>
      </span>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title={label}
        aria-label={label}
        className="min-h-11 min-w-11 rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="submit"
        className="min-h-11 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-xs font-medium text-danger"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="min-h-11 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </span>
  );
}
