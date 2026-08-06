"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Telescope, Loader2, Copy, Check, AlertTriangle, Search, Download, BrainCircuit } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

type Section = { key: string; title: string; body: string };

const FOCI: { id: string; label: string }[] = [
  { id: "finance", label: "Cash & margin" },
  { id: "sales", label: "Sales & growth" },
  { id: "pricing", label: "Pricing" },
  { id: "marketing", label: "Marketing & ROAS" },
  { id: "inventory", label: "Inventory" },
  { id: "receivables", label: "Receivables" },
  { id: "payables", label: "Payables & suppliers" },
  { id: "costs", label: "Cost cutting" },
  { id: "customers", label: "Customers & churn" },
  { id: "people", label: "Team & hiring" },
  { id: "operations", label: "Operations" },
  { id: "product", label: "Product mix" },
  { id: "growth", label: "Growth & expansion" },
  { id: "competition", label: "Competition" },
  { id: "risk", label: "Risk radar" },
  { id: "capital", label: "Fundraising" },
  { id: "compliance", label: "Compliance" },
  { id: "exports", label: "Exports" },
  { id: "efficiency", label: "Efficiency" },
  { id: "strategy", label: "Strategy" },
];

const STEPS = ["Diagnosing the situation", "Weighing the options", "Writing the 30-day plan"];

export function DeepDivePanel() {
  const [focus, setFocus] = useState("finance");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");

  async function run() {
    setLoading(true); setErr(""); setSections([]); setCopied(false);
    try {
      const r = await fetch("/api/ai/deepdive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus, question }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.error || "Deep Dive failed."); }
      else setSections(j.sections || []);
    } catch { setErr("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  const reportTitle = () => `Deep Dive — ${question.trim() || FOCI.find((f) => f.id === focus)?.label || focus}`;
  const reportText = () => `# ${reportTitle()}\n\n` + sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n---\n\n");

  function copyAll() {
    navigator.clipboard?.writeText(reportText()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  function download() {
    const blob = new Blob([reportText()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `deep-dive-${focus}.md`; a.click();
    URL.revokeObjectURL(url);
  }

  async function saveToMemory() {
    if (saved === "saving") return;
    setSaved("saving");
    try {
      const r = await fetch("/api/memory", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: reportTitle(), content: reportText(), kind: "insight" }),
      });
      setSaved(r.ok ? "done" : "idle");
      if (r.ok) setTimeout(() => setSaved("idle"), 2500);
    } catch { setSaved("idle"); }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Focus area</div>
          <div className="flex flex-wrap gap-2">
            {FOCI.map((f) => (
              <button key={f.id} onClick={() => setFocus(f.id)}
                className={`rounded-full px-3.5 h-9 text-sm border transition-colors ${focus === f.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-3 h-11">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input value={question} onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) run(); }}
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder="Optional: a specific question (e.g. “why did margin drop last month?”)" />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Telescope className="h-4 w-4" />}
            {loading ? "Running Deep Dive…" : "Run Deep Dive"}
          </Button>
          <span className="text-xs text-muted-foreground">3-pass analysis · 12 credits</span>
        </div>
        {loading && (
          <div className="pt-1 space-y-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ animationDelay: `${i * 120}ms` }} /> {s}…
              </div>
            ))}
          </div>
        )}
        {err && <div className="flex items-start gap-2 text-sm text-danger"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {err}</div>}
      </Card>

      {sections.length > 0 && (
        <div className="flex justify-end gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={saveToMemory} disabled={saved === "saving"}>
            {saved === "done" ? <Check className="h-4 w-4" /> : <BrainCircuit className="h-4 w-4" />}
            {saved === "saving" ? "Saving…" : saved === "done" ? "Saved to Memory" : "Save to Cortex Memory"}
          </Button>
          <Button size="sm" variant="outline" onClick={download}><Download className="h-4 w-4" /> Download .md</Button>
          <Button size="sm" variant="outline" onClick={copyAll}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy report"}
          </Button>
        </div>
      )}

      {sections.map((s, i) => (
        <Card key={s.key} className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-6 w-6 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">{i + 1}</span>
            <h3 className="font-semibold">{s.title}</h3>
          </div>
          <div className="prose-cortex text-sm leading-7 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1"
            dangerouslySetInnerHTML={{ __html: mdToHtml(s.body) }} />
        </Card>
      ))}
    </div>
  );
}
