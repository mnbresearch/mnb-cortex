"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2, ChevronLeft, ChevronRight, Loader2, ArrowUpDown, Filter, Clock, UserCheck } from "lucide-react";
import { addTask, moveTask, deleteTask, type ActionTask } from "@/lib/actions";

type Task = ActionTask;
const COLS = ["To do", "In progress", "Done"] as const;

/*
  Starts empty. This used to seed every workspace's board with another company's
  tasks ("Chase Apex Traders (₹18 L overdue)"), which then persisted as if the
  owner had written them.
*/
const SEED: Task[] = [];

const pt: Record<string, string> = {
  P0: "bg-danger text-white border-danger font-semibold animate-pulse",
  P1: "bg-danger/10 text-danger border-danger/20 font-medium",
  P2: "bg-warning/10 text-warning border-warning/20",
  P3: "bg-primary/10 text-primary border-primary/20",
};

/*
  ActionBoard with Bond-grade P0–P3 self-managing prioritization,
  automated triage, and counterparty tracking ("Waiting on").
*/
export function ActionBoard({ initial = SEED }: { initial?: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [draft, setDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState<"P0" | "P1" | "P2" | "P3">("P1");
  const [waitingOnDraft, setWaitingOnDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "p0_p1" | "waiting_on">("all");
  const [err, setErr] = useState("");

  useEffect(() => { setTasks(initial); }, [initial]);

  async function persist(fn: () => Promise<void>, rollback: Task[], what: string) {
    try { setErr(""); await fn(); }
    catch (e: any) {
      setTasks(rollback);
      setErr(e?.message ? `Couldn't ${what}: ${e.message}` : `Couldn't ${what} — check your connection and try again.`);
    }
  }

  async function add() {
    const title = draft.trim();
    if (!title) return;
    const waiting_on = waitingOnDraft.trim() || undefined;
    const priority = priorityDraft;
    setDraft("");
    setWaitingOnDraft("");
    const before = tasks;
    // Optimistic. The temporary id is replaced by the server's on next load.
    const tmp: Task = { id: "tmp" + Date.now(), title, col: 0, priority, waiting_on, source: "user" };
    setTasks((t) => [...t, tmp]);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("priority", priority);
    if (waiting_on) fd.set("waiting_on", waiting_on);
    await persist(() => addTask(fd), before, "save that task");
  }

  async function move(id: string, dir: -1 | 1) {
    const before = tasks;
    const cur = tasks.find((t) => t.id === id);
    if (!cur) return;
    const col = Math.max(0, Math.min(2, cur.col + dir)) as 0 | 1 | 2;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, col } : t)));
    if (id.startsWith("tmp")) return;   // not saved yet; nothing to move server-side
    const fd = new FormData(); fd.set("id", id); fd.set("col", String(col));
    await persist(() => moveTask(fd), before, "move that task");
  }

  async function del(id: string) {
    const before = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    if (id.startsWith("tmp")) return;
    const fd = new FormData(); fd.set("id", id);
    await persist(() => deleteTask(fd), before, "delete that task");
  }

  async function generate(mode: "actions" | "triage" = "actions") {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, input: "" }),
      });
      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || j?.ok === false || j?.error) {
        setErr(String(j?.error || j?.text || "Cortex couldn't triage actions right now. Try again in a moment."));
        return;
      }

      const lines: string[] = String(j.text || "").split("\n").filter((l) => /^\s*(\d+\.|[-*]|\*\*\[)/.test(l));
      const parsed: Task[] = lines.slice(0, 8).map((l, i) => {
        const prMatch = l.match(/\[(P[0123])\]/);
        const pr = (prMatch ? prMatch[1] : (mode === "triage" ? "P1" : "P2")) as any;
        const waitingMatch = l.match(/waiting on:?\s*([^)|—\n]+)/i);
        const waiting_on = waitingMatch ? waitingMatch[1].trim() : undefined;
        const title = l
          .replace(/^\s*(\d+\.|[-*])\s*/, "")
          .replace(/\*\*/g, "")
          .replace(/\[P[0123]\]\s*/, "")
          .split("—")[0]
          .trim()
          .slice(0, 90);
        return {
          id: "tmp" + Date.now() + i,
          title,
          col: 0 as const,
          priority: pr,
          waiting_on,
          source: "ai",
        };
      }).filter((t) => t.title);

      if (!parsed.length) {
        setErr("Cortex didn't find any clear actions from your current numbers. Add or import more data and try again.");
        return;
      }

      setTasks((t) => [...parsed, ...t]);
      const failed: string[] = [];
      for (const t of parsed) {
        const fd = new FormData();
        fd.set("title", t.title);
        if (t.priority) fd.set("priority", t.priority);
        if (t.waiting_on) fd.set("waiting_on", t.waiting_on);
        fd.set("source", "ai");
        try { await addTask(fd); } catch { failed.push(t.id); }
      }
      if (failed.length) {
        setTasks((t) => t.filter((x) => !failed.includes(x.id)));
        setErr(
          failed.length === parsed.length
            ? "Cortex generated actions but none could be saved — check your connection and try again."
            : `${failed.length} of ${parsed.length} actions couldn't be saved and have been removed from the board. The rest are saved.`,
        );
      }
    } catch (e: any) {
      setErr(e?.message ? `Couldn't reach Cortex: ${e.message}` : "Couldn't reach Cortex — check your connection and try again.");
    } finally { setLoading(false); }
  }

  const displayedTasks = tasks.filter((t) => {
    if (filter === "p0_p1") return t.priority === "P0" || t.priority === "P1";
    if (filter === "waiting_on") return Boolean(t.waiting_on);
    return true;
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-base flex items-center gap-2">
            <span>Executive Action Board</span>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-normal">P0–P3 Prioritized</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Self-managing operational to-do list with counterparty follow-up tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border bg-secondary/30 p-0.5 text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 rounded-md transition-colors ${filter === "all" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}
            >
              All ({tasks.length})
            </button>
            <button
              onClick={() => setFilter("p0_p1")}
              className={`px-2.5 py-1 rounded-md transition-colors ${filter === "p0_p1" ? "bg-background shadow font-medium text-danger" : "text-muted-foreground"}`}
            >
              P0 & P1 Urgent
            </button>
            <button
              onClick={() => setFilter("waiting_on")}
              className={`px-2.5 py-1 rounded-md transition-colors ${filter === "waiting_on" ? "bg-background shadow font-medium text-primary" : "text-muted-foreground"}`}
            >
              Waiting On
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => generate("triage")} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
            Auto-Triage P0–P3
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-12 gap-2 bg-secondary/15 p-2 rounded-lg border">
        <div className="sm:col-span-6">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Add an executive action or task…"
            aria-label="Add a task"
            className="w-full rounded-md border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="sm:col-span-3">
          <input
            value={waitingOnDraft}
            onChange={(e) => setWaitingOnDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Waiting on (e.g. Ramesh, Vendor)…"
            aria-label="Waiting on"
            className="w-full rounded-md border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="sm:col-span-2">
          <select
            value={priorityDraft}
            onChange={(e) => setPriorityDraft(e.target.value as any)}
            className="w-full rounded-md border bg-background px-2.5 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="P0">P0 (Critical / Blocker)</option>
            <option value="P1">P1 (High Priority)</option>
            <option value="P2">P2 (Medium)</option>
            <option value="P3">P3 (Low / Delegated)</option>
          </select>
        </div>
        <div className="sm:col-span-1">
          <Button onClick={add} size="sm" className="w-full h-9">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {err && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        {COLS.map((name, ci) => {
          const colTasks = displayedTasks.filter((t) => t.col === ci);
          return (
            <div key={name} className="rounded-lg border bg-background/40 p-3 flex flex-col">
              <div className="text-sm font-medium mb-2.5 flex items-center justify-between">
                <span>{name}</span>
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-normal text-muted-foreground">
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-2 min-h-[80px] flex-1">
                {colTasks.map((t) => (
                  <div key={t.id} className="rounded-lg border bg-card p-3 text-sm shadow-sm space-y-1.5 hover:border-primary/40 transition-colors">
                    <div className="flex items-start gap-1.5">
                      {t.priority && (
                        <span className={`text-[10px] rounded border px-1.5 py-0.5 shrink-0 ${pt[t.priority] || pt.P2}`}>
                          {t.priority}
                        </span>
                      )}
                      <span className={`flex-1 font-medium ${t.col === 2 ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {t.title}
                      </span>
                    </div>
                    {t.waiting_on && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded w-fit">
                        <UserCheck className="h-3 w-3 text-primary" />
                        <span>Waiting on: <strong className="text-foreground">{t.waiting_on}</strong></span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 pt-1 border-t border-border/40">
                      <button
                        onClick={() => move(t.id, -1)}
                        disabled={t.col === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 min-h-11 min-w-11 p-2 rounded hover:bg-secondary flex items-center justify-center"
                        aria-label="Previous"
                      >
                        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => move(t.id, 1)}
                        disabled={t.col === 2}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 min-h-11 min-w-11 p-2 rounded hover:bg-secondary flex items-center justify-center"
                        aria-label="Next"
                      >
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => del(t.id)}
                        className="ml-auto text-muted-foreground hover:text-danger min-h-11 min-w-11 p-2 rounded hover:bg-danger/10 flex items-center justify-center"
                        aria-label="Remove"
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Ranked P0 to P3. Syncs seamlessly across all devices and workspace members.
      </p>
    </Card>
  );
}
