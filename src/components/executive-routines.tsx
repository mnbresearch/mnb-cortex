"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Repeat, Play, Pause, Sparkles, Clock, CheckCircle2 } from "lucide-react";
import { addExecutiveRoutine, toggleExecutiveRoutine, type ExecutiveRoutine } from "@/lib/actions";

interface Props {
  initial: ExecutiveRoutine[];
}

const DEFAULT_PRESETS: Partial<ExecutiveRoutine>[] = [
  { title: "Decision-Grade Morning Briefing", frequency: "daily", action_type: "brief" },
  { title: "Daily P0–P3 Action Triage & Clean-up", frequency: "daily", action_type: "triage" },
  { title: "Weekly Counterparty Commitment Sweep", frequency: "weekly", action_type: "commitments" },
  { title: "Weekly Financial Health Digest", frequency: "weekly", action_type: "digest" },
];

export function ExecutiveRoutines({ initial }: Props) {
  const [routines, setRoutines] = useState<ExecutiveRoutine[]>(initial);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [actionType, setActionType] = useState<"brief" | "triage" | "commitments" | "digest">("brief");
  const [err, setErr] = useState("");

  async function handleAdd(customTitle?: string, customFreq?: any, customAction?: any) {
    const t = (customTitle || title).trim();
    if (!t) return;
    const f = customFreq || frequency;
    const a = customAction || actionType;

    const tempId = "tmp" + Date.now();
    const newRoutine: ExecutiveRoutine = {
      id: tempId,
      title: t,
      frequency: f,
      action_type: a,
      is_active: true,
      last_run: null,
      created_at: new Date().toISOString(),
    };

    const before = routines;
    setRoutines([newRoutine, ...routines]);
    if (!customTitle) setTitle("");

    const fd = new FormData();
    fd.set("title", t);
    fd.set("frequency", f);
    fd.set("action_type", a);

    try {
      setErr("");
      await addExecutiveRoutine(fd);
    } catch (e: any) {
      setRoutines(before);
      setErr(e?.message || "Failed to add executive routine");
    }
  }

  async function handleToggle(id: string, active: boolean) {
    const before = routines;
    setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: !active } : r)));

    const fd = new FormData();
    fd.set("id", id);
    fd.set("is_active", String(!active));

    try {
      setErr("");
      await toggleExecutiveRoutine(fd);
    } catch (e: any) {
      setRoutines(before);
      setErr(e?.message || "Failed to update routine");
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-base flex items-center gap-2">
            <span>Executive Autopilot Routines</span>
            <Badge className="text-xs">Bond Parity</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recurring operations procedures running automatically: morning briefing, commitment sweeps, and daily triage
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-12 gap-2 bg-secondary/15 p-2 rounded-lg border">
        <div className="sm:col-span-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New Routine Title (e.g. Daily 8 AM Leadership Brief)…"
            className="w-full rounded-md border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="sm:col-span-3">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as any)}
            className="w-full rounded-md border bg-background px-2.5 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="daily">Daily Schedule</option>
            <option value="weekly">Weekly Schedule</option>
            <option value="monthly">Monthly Schedule</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as any)}
            className="w-full rounded-md border bg-background px-2.5 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="brief">Morning Brief</option>
            <option value="triage">P0–P3 Triage</option>
            <option value="commitments">Commitment Sweep</option>
            <option value="digest">Operations Digest</option>
          </select>
        </div>
        <div className="sm:col-span-1">
          <Button onClick={() => handleAdd()} size="sm" className="w-full h-9">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {err && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      {/* Quick Launch Bond Presets */}
      {routines.length === 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Quick Launch Recommended Routines:</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {DEFAULT_PRESETS.map((p, idx) => (
              <div key={idx} className="p-3 rounded-lg border bg-card flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground capitalize">{p.frequency} · {p.action_type}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleAdd(p.title, p.frequency, p.action_type)}>
                  Enable
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Routines List */}
      <div className="space-y-2 pt-2">
        {routines.map((r) => (
          <div key={r.id} className="p-3.5 rounded-lg border bg-card flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Repeat className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <span>{r.title}</span>
                  <Badge className="text-[10px] capitalize font-normal bg-secondary">
                    {r.frequency}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>Action: <strong>{r.action_type}</strong></span>
                  <span>·</span>
                  <span>{r.last_run ? `Last run ${new Date(r.last_run).toLocaleDateString("en-IN")}` : "Scheduled to run on next autopilot cycle"}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={r.is_active ? "outline" : "secondary"}
                size="sm"
                onClick={() => handleToggle(r.id, r.is_active)}
                className="gap-1.5 text-xs"
              >
                {r.is_active ? <Pause className="h-3.5 w-3.5 text-warning" /> : <Play className="h-3.5 w-3.5 text-success" />}
                {r.is_active ? "Pause" : "Resume"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
