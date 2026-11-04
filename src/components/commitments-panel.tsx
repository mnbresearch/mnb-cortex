"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle2, AlertTriangle, Clock, Trash2, ArrowUpRight, ArrowDownLeft, Sparkles, Loader2 } from "lucide-react";
import { addCommitment, updateCommitmentStatus, deleteCommitment, type Commitment } from "@/lib/actions";

interface Props {
  initial: Commitment[];
}

export function CommitmentsPanel({ initial }: Props) {
  const [items, setItems] = useState<Commitment[]>(initial);
  const [title, setTitle] = useState("");
  const [party, setParty] = useState("");
  const [direction, setDirection] = useState<"we_promised" | "they_promised">("we_promised");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [err, setErr] = useState("");

  async function handleAdd() {
    if (!title.trim() || !party.trim()) return;
    const tempId = "tmp" + Date.now();
    const newItem: Commitment = {
      id: tempId,
      title: title.trim(),
      party: party.trim(),
      direction,
      due_date: dueDate || null,
      status: "pending",
      source: "user",
    };
    const before = items;
    setItems([newItem, ...items]);
    setTitle("");
    setParty("");
    setDueDate("");

    const fd = new FormData();
    fd.set("title", newItem.title);
    fd.set("party", newItem.party);
    fd.set("direction", newItem.direction);
    if (newItem.due_date) fd.set("due_date", newItem.due_date);
    fd.set("source", "user");

    try {
      setErr("");
      await addCommitment(fd);
    } catch (e: any) {
      setItems(before);
      setErr(e?.message || "Failed to save commitment");
    }
  }

  async function handleStatus(id: string, status: "pending" | "fulfilled" | "slipped") {
    const before = items;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    try {
      setErr("");
      await updateCommitmentStatus(fd);
    } catch (e: any) {
      setItems(before);
      setErr(e?.message || "Failed to update commitment status");
    }
  }

  async function handleDelete(id: string) {
    const before = items;
    setItems((prev) => prev.filter((it) => it.id !== id));
    const fd = new FormData();
    fd.set("id", id);
    try {
      setErr("");
      await deleteCommitment(fd);
    } catch (e: any) {
      setItems(before);
      setErr(e?.message || "Failed to delete commitment");
    }
  }

  async function extractCommitmentsWithAi() {
    setAiExtracting(true);
    setErr("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commitments", input: "Scan recent business communication and invoices" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        setErr(data?.error || "Unable to extract commitments right now.");
        return;
      }
      // Trigger refresh or update state
    } catch (e: any) {
      setErr(e?.message || "Unable to reach Cortex AI.");
    } finally {
      setAiExtracting(false);
    }
  }

  const pendingWe = items.filter((i) => i.direction === "we_promised" && i.status === "pending");
  const pendingThey = items.filter((i) => i.direction === "they_promised" && i.status === "pending");

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-base flex items-center gap-2">
            <span>Automated Follow-ups & Commitment Tracker</span>
            <Badge className="text-xs">Bond Parity</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Never let a promise slip: track promises made by you and commitments counterparties owe you
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={extractCommitmentsWithAi} disabled={aiExtracting}>
          {aiExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
          AI Detect Commitments
        </Button>
      </div>

      <div className="grid sm:grid-cols-12 gap-2 bg-secondary/15 p-2 rounded-lg border">
        <div className="sm:col-span-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Commitment / Deliverable…"
            className="w-full rounded-md border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="sm:col-span-3">
          <input
            value={party}
            onChange={(e) => setParty(e.target.value)}
            placeholder="Counterparty / Person…"
            className="w-full rounded-md border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="sm:col-span-2">
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as any)}
            className="w-full rounded-md border bg-background px-2.5 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="we_promised">We Promised</option>
            <option value="they_promised">They Promised Us</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="sm:col-span-1">
          <Button onClick={handleAdd} size="sm" className="w-full h-9">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {err && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4 pt-2">
        {/* We Promised */}
        <div className="rounded-lg border bg-background/50 p-3 space-y-3">
          <div className="flex items-center justify-between text-sm font-medium border-b pb-2">
            <span className="flex items-center gap-1.5 text-foreground">
              <ArrowUpRight className="h-4 w-4 text-warning" />
              What We Promised ({pendingWe.length})
            </span>
            <span className="text-xs text-muted-foreground">Deliverables to clients & vendors</span>
          </div>
          <div className="space-y-2">
            {pendingWe.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No active promises made by your team.</p>
            ) : (
              pendingWe.map((item) => (
                <div key={item.id} className="p-3 rounded-lg border bg-card text-sm space-y-1.5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="text-xs font-semibold text-primary px-2 py-0.5 rounded bg-primary/10 shrink-0">
                      {item.party}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{item.due_date ? `Due ${item.due_date}` : "No fixed deadline"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStatus(item.id, "fulfilled")}
                        className="text-success hover:underline p-1 flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Fulfill
                      </button>
                      <button
                        onClick={() => handleStatus(item.id, "slipped")}
                        className="text-danger hover:underline p-1 flex items-center gap-1"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Slipped
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-muted-foreground hover:text-danger min-h-11 min-w-11 p-2 flex items-center justify-center rounded"
                        aria-label="Delete commitment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* They Promised Us */}
        <div className="rounded-lg border bg-background/50 p-3 space-y-3">
          <div className="flex items-center justify-between text-sm font-medium border-b pb-2">
            <span className="flex items-center gap-1.5 text-foreground">
              <ArrowDownLeft className="h-4 w-4 text-primary" />
              What They Promised Us ({pendingThey.length})
            </span>
            <span className="text-xs text-muted-foreground">Follow-ups waiting on others</span>
          </div>
          <div className="space-y-2">
            {pendingThey.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No pending items waiting on external parties.</p>
            ) : (
              pendingThey.map((item) => (
                <div key={item.id} className="p-3 rounded-lg border bg-card text-sm space-y-1.5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="text-xs font-semibold text-warning px-2 py-0.5 rounded bg-warning/10 shrink-0">
                      {item.party}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{item.due_date ? `Expected ${item.due_date}` : "Ongoing"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStatus(item.id, "fulfilled")}
                        className="text-success hover:underline p-1 flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Received
                      </button>
                      <button
                        onClick={() => handleStatus(item.id, "slipped")}
                        className="text-danger hover:underline p-1 flex items-center gap-1"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Overdue
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-muted-foreground hover:text-danger min-h-11 min-w-11 p-2 flex items-center justify-center rounded"
                        aria-label="Delete commitment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
