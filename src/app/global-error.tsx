"use client";
import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the root layout itself, where even
 * the normal error page can't render. Must supply its own <html>/<body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[cortex] global error", { message: error?.message, digest: error?.digest, stack: error?.stack });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#0b0f0d", color: "#e8efeb", margin: 0 }}>
        <div style={{ maxWidth: 520, margin: "12vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>MNB Cortex is temporarily unavailable</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#a9b8b1" }}>
            Something failed while loading the application shell. Your data is safe and unchanged.
          </p>
          {error?.digest && (
            <p style={{ fontSize: 12, color: "#7f8f88" }}>Reference: <code>{error.digest}</code></p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 16, background: "#2f6b54", color: "#fff", border: 0, borderRadius: 9, padding: "10px 18px", fontSize: 14, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
