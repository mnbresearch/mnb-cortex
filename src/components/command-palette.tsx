"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV } from "@/lib/nav";
import { Search, CornerDownLeft, Sparkles, FileText } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const [records, setRecords] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); setQ(""); setI(0); setRecords([]); }
      if (e.key === "Escape") setOpen(false);
    };
    /*
      The palette searches all 122 modules and was reachable ONLY by pressing
      Ctrl/Cmd-K — a shortcut a business owner has no reason to guess. With a
      nav this large, hiding search behind a keystroke is most of why the app
      feels hard to navigate. The sidebar now shows a real control that fires
      this event, so the same palette has a visible front door.
    */
    const openViaEvent = () => { setOpen(true); setQ(""); setI(0); setRecords([]); };
    window.addEventListener("cortex:open-palette", openViaEvent);
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      window.removeEventListener("cortex:open-palette", openViaEvent);
    };
  }, []);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setRecords([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setRecords(d.results || [])).catch(() => setRecords([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const navItems = NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase()));
  const askItem = q.trim() ? [{ label: `Ask AI: "${q}"`, href: `/chat?q=${encodeURIComponent(q)}`, ask: true }] : [];
  const recItems = records.map((r) => ({ label: r.label, href: r.href, record: true, type: r.type, sub: r.sub }));
  const all: any[] = [...askItem, ...navItems, ...recItems];

  function go(idx: number) { const it = all[idx]; if (!it) return; setOpen(false); router.push(it.href); }
  if (!open) return null;

  /*
    A REAL COMBOBOX, because this was the most broken widget in the app.

    It is the primary way to reach 122 modules, and to a screen reader it was
    a text box next to some buttons. The selection lived in React state and was
    drawn ONLY as a background colour, so arrow keys moved a highlight nobody
    was told about and Enter activated an item that had never been announced.
    A blind user could type, hear nothing, press Enter, and arrive somewhere
    they did not choose.

    The ARIA 1.2 combobox pattern needs four things wired together, and the
    reason it works is that focus never leaves the input:

      the input is role="combobox", owning the list via aria-controls;
      the list is role="listbox" and each row role="option";
      aria-activedescendant names the option that is visually highlighted, so
        the reader announces it on every arrow press without moving focus;
      aria-selected marks it, so the row is described as selected rather than
        just being a different colour.

    Result count is announced separately: the records arrive asynchronously
    from /api/search, so without a live region the list silently changes under
    a user who has no way to know more options appeared.
  */
  const listId = "cortex-palette-list";
  const activeId = all.length ? `cortex-palette-opt-${i}` : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-32"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Search modules and records"
        className="w-full max-w-lg rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
            role="combobox"
            aria-expanded={all.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search modules, your records, or ask Cortex"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, all.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); go(i); }
            }}
            placeholder="Search modules, your records, or ask Cortex…" className="flex-1 bg-transparent outline-none text-sm" />
          <kbd className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* The list changes asynchronously as /api/search returns. Announced
            politely so it never interrupts what the user is typing. */}
        <p className="sr-only" role="status" aria-live="polite">
          {q.trim().length < 2
            ? "Type at least two characters to search."
            : `${all.length} result${all.length === 1 ? "" : "s"}.`}
        </p>

        <div className="max-h-96 overflow-y-auto p-2">
          {all.length === 0 && <p className="text-sm text-muted-foreground p-3">Type to search…</p>}
          <div role="listbox" id={listId} aria-label="Search results">
            {all.map((it, idx) => {
              const Icon = it.ask ? Sparkles : it.record ? FileText : (it.icon || Search);
              return (
                <button
                  key={idx}
                  id={`cortex-palette-opt-${idx}`}
                  role="option"
                  aria-selected={idx === i}
                  /* Focus stays in the input — that is what makes
                     aria-activedescendant work — so these must not be reachable
                     by Tab, or the tab order would fight the arrow keys. */
                  tabIndex={-1}
                  onMouseEnter={() => setI(idx)} onClick={() => go(idx)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left ${idx === i ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{it.label}{it.sub && <span className={`ml-2 text-xs ${idx===i?"opacity-80":"text-muted-foreground"}`}>{it.sub}</span>}</span>
                  {it.record && <span className={`text-[10px] rounded px-1.5 py-0.5 ${idx===i?"bg-white/20":"bg-secondary"}`}>{it.type}</span>}
                  {idx === i && <CornerDownLeft className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
