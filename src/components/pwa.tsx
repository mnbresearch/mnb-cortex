"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, X, ArrowUp } from "lucide-react";
import { Logo } from "@/components/logo";

declare global { interface Window { __pwaPrompt?: any } }

/**
 * Install prompt and update notice.
 *
 * Both used to be far too aggressive:
 *
 * - The update notice was a FULL-SCREEN BLOCKER reading "Update required",
 *   triggered whenever a new service worker was waiting — which is every single
 *   deploy. Anyone half-way through entering an invoice lost the form. Shipping
 *   often is good; punishing the user for it is not. It is now a dismissible
 *   corner notice, and the update applies on its own at the next safe moment.
 *
 * - The install card appeared the instant the browser offered it, covering
 *   content on the very first page view, before the visitor knew what the
 *   product was. It now waits until someone has actually used the app for a
 *   while, and never reappears once dismissed.
 */

const DISMISS_KEY = "pwa-install-dismissed";
const SEEN_KEY = "pwa-visits";
/** Don't ask on the first visit, and not until they've stayed a while. */
const MIN_VISITS = 2;
const MIN_DWELL_MS = 45_000;

export function PWA() {
  const [installable, setInstallable] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // ---- install ----------------------------------------------------------
    let dwell: ReturnType<typeof setTimeout> | null = null;

    let visits = 1;
    try {
      visits = Number(localStorage.getItem(SEEN_KEY) || "0") + 1;
      localStorage.setItem(SEEN_KEY, String(visits));
    } catch { /* private mode — just don't nag */ }

    const onBip = (e: any) => {
      e.preventDefault();
      window.__pwaPrompt = e;
      setInstallable(true);
      window.dispatchEvent(new Event("pwa-installable"));

      let dismissed = false;
      try { dismissed = Boolean(localStorage.getItem(DISMISS_KEY)); } catch {}
      if (dismissed || visits < MIN_VISITS) return;

      // Earned attention: they've come back, and stayed.
      dwell = setTimeout(() => setShowInstall(true), MIN_DWELL_MS);
    };

    const onInstalled = () => {
      setShowInstall(false);
      setInstallable(false);
      window.__pwaPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    // ---- service worker ---------------------------------------------------
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaitingSW(reg.waiting); setUpdateReady(true);
        }
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingSW(nw); setUpdateReady(true);
            }
          });
        });
      }).catch(() => {});

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      if (dwell) clearTimeout(dwell);
    };
  }, []);

  const update = useCallback(() => waitingSW?.postMessage("SKIP_WAITING"), [waitingSW]);

  /**
   * Apply a pending update when the user next leaves the tab. Reloading while
   * they're looking at the page is the disruptive part; doing it while they're
   * elsewhere means they simply come back to the current version.
   */
  useEffect(() => {
    if (!updateReady || !waitingSW) return;
    const onHide = () => { if (document.visibilityState === "hidden") update(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [updateReady, waitingSW, update]);

  function dismissInstall() {
    setShowInstall(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
  }

  return (
    <>
      {/* Update available — a notice, not a wall. */}
      {updateReady && !updateDismissed && (
        <div className="fixed bottom-20 lg:bottom-6 left-3 lg:left-6 z-[60] max-w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border bg-card/95 backdrop-blur shadow-lg p-3.5 no-print animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/15 grid place-items-center">
              <ArrowUp className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">A new version is ready</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                It'll apply automatically when you next switch away. Finish what you're doing first.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={update}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-8 px-3 text-xs font-medium hover:opacity-90"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Reload now
                </button>
                <button
                  onClick={() => setUpdateDismissed(true)}
                  className="rounded-lg border h-8 px-3 text-xs hover:bg-accent"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Install — only once they've come back and stayed. */}
      {showInstall && installable && (
        <div className="fixed bottom-20 lg:bottom-6 inset-x-3 lg:left-auto lg:right-6 lg:w-80 z-[55] rounded-xl border bg-card/95 backdrop-blur shadow-lg p-4 no-print animate-fade-in">
          <button
            onClick={dismissInstall}
            aria-label="Dismiss install prompt"
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-sm font-medium">Install MNB Cortex</p>
              <p className="text-xs text-muted-foreground">Full screen, and it opens straight from your home screen.</p>
            </div>
          </div>
          <button
            onClick={async () => {
              const p = window.__pwaPrompt; if (!p) return;
              p.prompt(); await p.userChoice;
              window.__pwaPrompt = null; setShowInstall(false); setInstallable(false);
            }}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 text-sm font-medium hover:opacity-90 sheen"
          >
            <Download className="h-4 w-4" /> Install
          </button>
        </div>
      )}
    </>
  );
}
