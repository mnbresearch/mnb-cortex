"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2, Loader2, Gavel } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

type Decision = { id: string; title: string; rationale: string; date: string; status: "considering" | "decided" | "revisit" };

export function DecisionJournal() {
  const [items, setItems] = useState<Decision[]>([]);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [critique, setCritique] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState("");

  useEffect(() => { try { const s = localStorage.getItem("cortex_decisions"); if (s) setItems(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("cortex_decisions", JSON.stringify(items)); } catch {} }, [items]);

  function add() {
    if (!title.trim()) return;
    setItems((d) => [{ id: "d" + Date.now(), title: title.trim(), rationale: rationale.trim(), date: new Date().toISOString(), status: "considering" }, ...d]);
    setTitle(""); setRationale("");
  }
  function del(id: string) { setItems((d) => d.filter((x) => x.id !== id)); }
  function setStatus(id: string, status: Decision["status"]) { setItems((d) => d.map((x) => x.id === id ? { ...x, status } : x)); }

  async function stressTest(d: Decision) {
    setLoading(d.id);
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "critique", input: `Decision: ${d.title}\nMy rationale: ${d.rationale || "(none given)"}` }) });
      const j = await r.json(); setCritique((c) => ({ ...c, [d.id]: j.text || "No response." }));
    } catch { setCritique((c) => ({ ...c, [d.id]: "Network error reaching the AI." })); } finally { setLoading(""); }
  }

  const tone: Record<string, string> = { considering: "bg-warning/10 text-warning border-warning/20", decided: "bg-success/10 text-success border-success/20", revisit: "bg-primary/10 text-primary border-primary/20" };

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="font-semibold flex items-center gap-2"><Gavel className="h-4 w-4 text-primary" /> Log a decision</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The decision (e.g. Enter the UAE market in Q3)"
          className="w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} placeholder="Why — your reasoning and the key assumptions"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
        <Button onClick={add}><Plus className="h-4 w-4" /> Save decision</Button>
      </Card>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No decisions logged yet. Writing them down — with your reasoning — makes it far easier to learn from what worked and what didn't.</p>
      ) : items.map((d) => (
        <Card key={d.id} className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{d.title}</div>
              <div className="text-xs text-muted-foreground">{new Date(d.date).toLocaleDateString("en-IN")}</div>
              {d.rationale && <p className="text-sm text-muted-foreground mt-1">{d.rationale}</p>}
            </div>
            <button onClick={() => del(d.id)} className="text-muted-foreground hover:text-danger shrink-0"><Trash2 className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["considering", "decided", "revisit"] as const).map((s) => (
              <button key={s} onClick={() => setStatus(d.id, s)}>
                <Badge className={d.status === s ? tone[s] : "border-border text-muted-foreground"}>{s}</Badge>
              </button>
            ))}
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => stressTest(d)} disabled={loading === d.id}>
              {loading === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Devil's advocate
            </Button>
          </div>
          {critique[d.id] && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(critique[d.id]) }} />}
        </Card>
      ))}
    </div>
  );
}
