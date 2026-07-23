"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type Task = { id: string; title: string; col: 0 | 1 | 2; priority?: "P1" | "P2" | "P3" };
const COLS = ["To do", "In progress", "Done"] as const;

const SEED: Task[] = [
  { id: "t1", title: "Approve PO-4471 for RM-204", col: 0, priority: "P1" },
  { id: "t2", title: "Chase Apex Traders (₹18 L overdue)", col: 0, priority: "P1" },
  { id: "t3", title: "Reprice low-elasticity SKUs +4%", col: 1, priority: "P2" },
  { id: "t4", title: "Add backup RM-204 supplier", col: 0, priority: "P2" },
];

const pt: Record<string, string> = { P1: "bg-danger/10 text-danger border-danger/20", P2: "bg-warning/10 text-warning border-warning/20", P3: "bg-primary/10 text-primary border-primary/20" };

export function ActionBoard() {
  const [tasks, setTasks] = useState<Task[]>(SEED);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { try { const s = localStorage.getItem("cortex_tasks"); if (s) setTasks(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("cortex_tasks", JSON.stringify(tasks)); } catch {} }, [tasks]);

  function add() { if (!draft.trim()) return; setTasks((t) => [...t, { id: "t" + Date.now(), title: draft.trim(), col: 0 }]); setDraft(""); }
  function move(id: string, dir: -1 | 1) { setTasks((ts) => ts.map((t) => t.id === id ? { ...t, col: Math.max(0, Math.min(2, t.col + dir)) as 0 | 1 | 2 } : t)); }
  function del(id: string) { setTasks((ts) => ts.filter((t) => t.id !== id)); }

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "actions", input: "" }) });
      const j = await r.json();
      const lines: string[] = String(j.text || "").split("\n").filter((l) => /^\s*(\d+\.|[-*]|\*\*\[)/.test(l));
      const parsed: Task[] = lines.slice(0, 8).map((l, i) => {
        const pr = (l.match(/\[(P[123])\]/) || [])[1] as any;
        const title = l.replace(/^\s*(\d+\.|[-*])\s*/, "").replace(/\*\*/g, "").replace(/\[P[123]\]\s*/, "").split("—")[0].trim().slice(0, 90);
        return { id: "t" + Date.now() + i, title, col: 0 as const, priority: pr };
      }).filter((t) => t.title);
      if (parsed.length) setTasks((t) => [...parsed, ...t]);
    } catch {} finally { setLoading(false); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">Action board</div>
        <Button variant="outline" size="sm" onClick={generate} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate from my business</Button>
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a task…"
          className="flex-1 rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <Button onClick={add}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {COLS.map((name, ci) => (
          <div key={name} className="rounded-lg border bg-background/40 p-3">
            <div className="text-sm font-medium mb-2 flex items-center justify-between">{name}<span className="text-xs text-muted-foreground">{tasks.filter((t) => t.col === ci).length}</span></div>
            <div className="space-y-2 min-h-[60px]">
              {tasks.filter((t) => t.col === ci).map((t) => (
                <div key={t.id} className="rounded-lg border bg-card p-2.5 text-sm">
                  <div className="flex items-start gap-1.5">
                    {t.priority && <span className={`text-[10px] rounded border px-1 py-0.5 ${pt[t.priority]}`}>{t.priority}</span>}
                    <span className={`flex-1 ${t.col === 2 ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <button onClick={() => move(t.id, -1)} disabled={t.col === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => move(t.id, 1)} disabled={t.col === 2} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                    <button onClick={() => del(t.id)} className="ml-auto text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Saved to this device. Use the arrows to move a task across the board.</p>
    </Card>
  );
}
