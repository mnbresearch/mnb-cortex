"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Download, Smartphone, Share, Plus } from "lucide-react";

export function InstallCTA() {
  const [prompt, setPrompt] = useState<any>(null);
  const [standalone, setStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as any).standalone);
    if (window.__pwaPrompt) setPrompt(window.__pwaPrompt);
    const onReady = () => setPrompt(window.__pwaPrompt);
    window.addEventListener("pwa-installable", onReady);
    return () => window.removeEventListener("pwa-installable", onReady);
  }, []);

  if (standalone) return null; // already installed

  async function install() { const p = window.__pwaPrompt; if (!p) return; p.prompt(); await p.userChoice; window.__pwaPrompt = null; setPrompt(null); }

  return (
    <Card className="p-5 bg-gradient-to-br from-primary/10 to-purple-500/5 border-primary/20 no-print">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/15 p-2.5"><Smartphone className="h-6 w-6 text-primary" /></div>
          <div>
            <p className="font-medium">Install MNB Cortex on your phone</p>
            <p className="text-sm text-muted-foreground">Full-screen app, offline access, and instant launch from your home screen.</p>
          </div>
        </div>
        {isIOS ? (
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">Tap <Share className="h-4 w-4 inline" /> then <span className="font-medium text-foreground">Add to Home Screen</span> <Plus className="h-4 w-4 inline" /></div>
        ) : prompt ? (
          <button onClick={install} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-5 text-sm font-medium hover:opacity-90"><Download className="h-4 w-4" /> Install app</button>
        ) : (
          <span className="text-sm text-muted-foreground">Open in Chrome/Edge and use the install icon in the address bar, or your browser menu → Install.</span>
        )}
      </div>
    </Card>
  );
}
