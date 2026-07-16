"use client";
import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";

declare global { interface Window { __pwaPrompt?: any } }

export function PWA() {
  const [installable, setInstallable] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const onBip = (e: any) => { e.preventDefault(); window.__pwaPrompt = e; setInstallable(true);
      if (!localStorage.getItem("pwa-install-dismissed")) setShowInstall(true);
      window.dispatchEvent(new Event("pwa-installable")); };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", () => { setShowInstall(false); setInstallable(false); window.__pwaPrompt = null; });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) { setWaitingSW(reg.waiting); setUpdateReady(true); }
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) { setWaitingSW(nw); setUpdateReady(true); }
          });
        });
      }).catch(() => {});
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (refreshing) return; refreshing = true; window.location.reload(); });
    }
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  async function install() {
    const p = window.__pwaPrompt; if (!p) return;
    p.prompt(); await p.userChoice; window.__pwaPrompt = null; setShowInstall(false); setInstallable(false);
  }
  function update() { waitingSW?.postMessage("SKIP_WAITING"); }

  return (
    <>
      {/* Update-available banner (option to update) */}
      {updateReady && (
        <div className="fixed top-3 inset-x-3 lg:left-auto lg:right-6 lg:w-96 z-[60] rounded-xl border bg-card shadow-lg p-4 flex items-center gap-3 no-print">
          <div className="rounded-lg bg-primary/15 p-2"><RefreshCw className="h-4 w-4 text-primary" /></div>
          <div className="flex-1"><p className="text-sm font-medium">A new version is available</p><p className="text-xs text-muted-foreground">Update to get the latest features & fixes.</p></div>
          <button onClick={update} className="rounded-lg bg-primary text-primary-foreground h-8 px-3 text-xs font-medium">Update now</button>
        </div>
      )}

      {/* Install pop-up (mobile-friendly) */}
      {showInstall && installable && (
        <div className="fixed bottom-20 lg:bottom-6 inset-x-3 lg:left-auto lg:right-6 lg:w-96 z-[55] rounded-xl border bg-card shadow-lg p-4 no-print">
          <button onClick={() => { setShowInstall(false); localStorage.setItem("pwa-install-dismissed", "1"); }} className="absolute top-2 right-2 text-muted-foreground"><X className="h-4 w-4" /></button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">C</div>
            <div className="flex-1"><p className="text-sm font-medium">Install MNB Cortex</p><p className="text-xs text-muted-foreground">Add the app to your phone for a faster, full-screen experience.</p></div>
          </div>
          <button onClick={install} className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 text-sm font-medium"><Download className="h-4 w-4" /> Install app</button>
        </div>
      )}
    </>
  );
}
