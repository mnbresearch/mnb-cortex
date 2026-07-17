"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
const SHORTCUTS = [
  { k: "⌘ / Ctrl + K", d: "Open command palette & search" },
  { k: "?", d: "Show this shortcuts help" },
  { k: "Esc", d: "Close dialogs" },
  { k: "Click ✨", d: "Open the AI Copilot (any page)" },
];
export function Shortcuts() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; const typing = /input|textarea|select/i.test(t?.tagName || "") || t?.isContentEditable;
      if (e.key === "?" && !typing) { e.preventDefault(); setOpen(true); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-sm rounded-xl border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><span className="font-semibold">Keyboard shortcuts</span><button onClick={() => setOpen(false)}><X className="h-4 w-4 text-muted-foreground" /></button></div>
        <div className="space-y-2">{SHORTCUTS.map((s) => <div key={s.d} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{s.d}</span><kbd className="text-xs border rounded px-2 py-0.5 bg-secondary">{s.k}</kbd></div>)}</div>
      </div>
    </div>
  );
}
