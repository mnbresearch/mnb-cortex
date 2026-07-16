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
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
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
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-32" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 h-12 border-b">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, all.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); go(i); }
            }}
            placeholder="Search modules, your records, or ask the AI COO…" className="flex-1 bg-transparent outline-none text-sm" />
          <kbd className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {all.length === 0 && <p className="text-sm text-muted-foreground p-3">Type to search…</p>}
          {all.map((it, idx) => {
            const Icon = it.ask ? Sparkles : it.record ? FileText : (it.icon || Search);
            return (
              <button key={idx} onMouseEnter={() => setI(idx)} onClick={() => go(idx)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left ${idx === i ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{it.label}{it.sub && <span className={`ml-2 text-xs ${idx===i?"opacity-80":"text-muted-foreground"}`}>{it.sub}</span>}</span>
                {it.record && <span className={`text-[10px] rounded px-1.5 py-0.5 ${idx===i?"bg-white/20":"bg-secondary"}`}>{it.type}</span>}
                {idx === i && <CornerDownLeft className="h-3.5 w-3.5 opacity-70" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
