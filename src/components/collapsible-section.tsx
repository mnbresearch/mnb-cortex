"use client";

/**
 * A dashboard section that folds away and remembers it per browser.
 * The summary line stays visible when folded, so a closed section still
 * says what is inside it ("4 alerts", "2 warnings").
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const KEY = "cortex.dashboard.sections.v1";

export function CollapsibleSection({
  id, title, summary, defaultOpen = false, children,
}: { id: string; title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (id in s) setOpen(!!s[id]);
    } catch {}
  }, [id]);
  function toggle() {
    setOpen((v) => {
      const next = !v;
      try {
        const s = JSON.parse(localStorage.getItem(KEY) || "{}");
        s[id] = next;
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {}
      return next;
    });
  }
  const region = `section-${id}`;
  return (
    <section className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={region}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="font-semibold">{title}</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          {!open && summary && <span className="hidden sm:inline">{summary}</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        </span>
      </button>
      {open && <div id={region} className="space-y-4 px-5 pb-5">{children}</div>}
    </section>
  );
}
