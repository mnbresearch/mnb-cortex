"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * Error boundary INSIDE the app shell.
 *
 * Without this, any error in a workspace page bubbled to the root error.tsx,
 * which unmounts the sidebar, topbar and command palette — the customer got
 * dumped from their dashboard onto a bare centred page. Its "Try again" called
 * reset() on the same failing layout, so it looped.
 *
 * This keeps the chrome, logs the error where support can find it, and shows
 * the digest so a customer can quote it.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Reaches the Vercel runtime logs. The old boundary destructured `error`
    // away entirely, so production errors were invisible.
    console.error("[cortex] app error", { message: error?.message, digest: error?.digest, stack: error?.stack });
  }, [error]);

  return (
    <div className="p-6 lg:p-10">
      <div className="max-w-lg rounded-2xl border bg-card p-6">
        <div className="h-11 w-11 rounded-full bg-danger/10 grid place-items-center">
          <AlertTriangle className="h-5 w-5 text-danger" />
        </div>
        <h2 className="mt-3 text-lg font-semibold">This page hit an error</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your data is safe — nothing was changed. The rest of Cortex is still working, so you can carry on elsewhere
          while we look at this.
        </p>

        {error?.digest && (
          <p className="text-xs text-muted-foreground mt-3">
            Reference: <code className="bg-secondary px-1.5 py-0.5 rounded">{error.digest}</code>
            <span className="block mt-0.5">Quote this if you contact support — it points us straight at the failure.</span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" /> Try this page again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border h-10 px-4 text-sm font-medium hover:bg-accent"
          >
            <Home className="h-4 w-4" /> Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
