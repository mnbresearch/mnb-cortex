"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { APP_VERSION } from "@/lib/config";
const HIGHLIGHTS = ["Global AI Copilot on every page", "Owner analytics dashboard", "Public API, deals pipeline & CRM", "Installable app + forced updates"];
export function WhatsNew() {
  const [show, setShow] = useState(false);
  useEffect(() => { if (localStorage.getItem("mnb-seen-version") !== APP_VERSION) setShow(true); }, []);
  function dismiss() { localStorage.setItem("mnb-seen-version", APP_VERSION); setShow(false); }
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[95] bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={dismiss}>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={dismiss} className="absolute right-4 top-4 text-muted-foreground"><X className="h-4 w-4" /></button>
        <div className="h-11 w-11 rounded-xl bg-primary/15 grid place-items-center"><Sparkles className="h-6 w-6 text-primary" /></div>
        <h2 className="mt-3 text-lg font-semibold">What's new · v{APP_VERSION}</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">{HIGHLIGHTS.map((h) => <li key={h} className="flex gap-2"><span className="text-primary">•</span>{h}</li>)}</ul>
        <div className="mt-4 flex gap-2">
          <button onClick={dismiss} className="flex-1 rounded-lg bg-primary text-primary-foreground h-10 text-sm font-medium">Got it</button>
          <Link href="/changelog" onClick={dismiss} className="rounded-lg border h-10 px-4 text-sm inline-flex items-center">Full changelog</Link>
        </div>
      </div>
    </div>
  );
}
