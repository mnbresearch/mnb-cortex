"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { addTask, moveTask, deleteTask, type ActionTask } from "@/lib/actions";

type Task = ActionTask;
const COLS = ["To do", "In progress", "Done"] as const;

/*
  Starts empty. This used to seed every workspace's board with another company's
  tasks ("Chase Apex Traders (₹18 L overdue)"), which then persisted as if the
  owner had written them.
*/
const SEED: Task[] = [];

const pt: Record<string, string> = { P1: "bg-danger/10 text-danger border-danger/20", P2: "bg-warning/10 text-warning border-warning/20", P3: "bg-primary/10 text-primary border-primary/20" };

/*
  `initial` is fetched on the server by the page and passed in, so the board is
  populated in the first paint rather than flashing empty.

  WHAT CHANGED. This component kept the entire board in localStorage. The owner
  opened Cortex on his phone and saw nothing — not stale, empty — and nobody on
  his team could see what he had committed to. It also meant the server had no
  idea what Cortex had suggested, so the product could never ask "you said you'd
  chase this three weeks ago, did you?", which is the loop it is sold on.

  Each mutation writes through a server action and then updates local state, so
  the board still feels instant while being real.
*/
export function ActionBoard({ initial = SEED }: { initial?: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setTasks(initial); }, [initial]);

  async function persist(fn: () => Promise<void>, rollback: Task[]) {
    try { await fn(); } catch { setTasks(rollback); }   // put it back if the write failed
  }

  async function add() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const before = tasks;
    // Optimistic. The temporary id is replaced by the server's on next load.
    const tmp: Task = { id: "tmp" + Date.now(), title, col: 0, source: "user" };
    setTasks((t) => [...t, tmp]);
    const fd = new FormData(); fd.set("title", title);
    await persist(() => addTask(fd), before);
  }

  async function move(id: string, dir: -1 | 1) {
    const before = tasks;
    const cur = tasks.find((t) => t.id === id);
    if (!cur) return;
    const col = Math.max(0, Math.min(2, cur.col + dir)) as 0 | 1 | 2;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, col } : t)));
    if (id.startsWith("tmp")) return;   // not saved yet; nothing to move server-side
    const fd = new FormData(); fd.set("id", id); fd.set("col", String(col));
    await persist(() => moveTask(fd), before);
  }

  async function del(id: string) {
    const before = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    if (id.startsWith("tmp")) return;
    const fd = new FormData(); fd.set("id", id);
    await persist(() => deleteTask(fd), before);
  }

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "actions", input: "" }) });
      const j = await r.json();
      const lines: string[] = String(j.text || "").split("\n").filter((l) => /^\s*(\d+\.|[-*]|\*\*\[)/.test(l));
      const parsed: Task[] = lines.slice(0, 8).map((l, i) => {
        const pr = (l.match(/\[(P[123])\]/) || [])[1] as any;
        const title = l.replace(/^\s*(\d+\.|[-*])\s*/, "").replace(/\*\*/g, "").replace(/\[P[123]\]\s*/, "").split("—")[0].trim().slice(0, 90);
        return { id: "tmp" + Date.now() + i, title, col: 0 as const, priority: pr, source: "ai" };
      }).filter((t) => t.title);
      if (parsed.length) {
        setTasks((t) => [...parsed, ...t]);
        // Persist each one, tagged source:"ai" so the follow-up loop can later
        // tell what Cortex suggested from what the owner wrote himself.
        for (const t of parsed) {
          const fd = new FormData();
          fd.set("title", t.title);
          if (t.priority) fd.set("priority", t.priority);
          fd.set("source", "ai");
          try { await addTask(fd); } catch { /* keep the rest */ }
        }
      }
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
      <p className="text-xs text-muted-foreground">Saved to your workspace — visible on every device and to your team. Use the arrows to move a task across the board.</p>
    </Card>
  );
}
