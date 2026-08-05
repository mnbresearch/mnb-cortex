"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Radar, Loader2, Check, X, AlertTriangle, ChevronDown, BrainCircuit, Copy } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

type Result = { prompt: string; answer: string; mentioned: boolean; position: number | null; competitorsFound: string[]; engine: string };
type Report = { brand: string; score: number; engine: string; grounded: boolean; results: Result[]; competitors: { name: string; hits: number }[]; missing: string[] };

const IN = "w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

export function VisibilityPanel() {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [fix, setFix] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!brand.trim()) return;
    setLoading(true); setErr(""); setReport(null); setFix(""); setSaved("idle");
    try {
      const r = await fetch("/api/visibility", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, category, location, competitors: competitors.split(",").map((c) => c.trim()).filter(Boolean) }),
      });
      const j = await r.json();
      if (!j.ok) setErr(j.error || "Check failed.");
      else { setReport(j.report); setFix(j.fix || ""); }
    } catch { setErr("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  async function saveFix() {
    if (!fix || saved === "saving") return;
    setSaved("saving");
    try {
      const r = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `AI Visibility fix — ${brand}`, content: fix, kind: "insight" }) });
      setSaved(r.ok ? "done" : "idle"); if (r.ok) setTimeout(() => setSaved("idle"), 2500);
    } catch { setSaved("idle"); }
  }
  function copyFix() { navigator.clipboard?.writeText(fix).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }

  const R = 54, C = 2 * Math.PI * R;
  const band = (s: number) => s >= 66 ? { t: "Strong", c: "text-success", stroke: "var(--success)" } : s >= 33 ? { t: "Patchy", c: "text-warning", stroke: "var(--warning)" } : { t: "Invisible", c: "text-danger", stroke: "var(--danger)" };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <input className={IN} placeholder="Your brand name *" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <input className={IN} placeholder="Category (e.g. gold jewellery exporter)" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input className={IN} placeholder="City / region (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <input className={IN} placeholder="Competitors, comma-separated (optional)" value={competitors} onChange={(e) => setCompetitors(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {loading ? "Asking the AI engines…" : "Run AI Visibility check"}
          </Button>
          <span className="text-xs text-muted-foreground">Runs your buyer questions through live AI · 10 credits</span>
        </div>
        {err && <div className="flex items-start gap-2 text-sm text-danger"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {err}</div>}
      </Card>

      {report && (
        <>
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative shrink-0">
                <svg width="140" height="140" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--secondary))" strokeWidth="12" />
                  <circle cx="70" cy="70" r={R} fill="none" stroke={`hsl(${band(report.score).stroke})`} strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={C * (1 - report.score / 100)} transform="rotate(-90 70 70)" style={{ transition: "stroke-dashoffset 1s cubic-bezier(.19,1,.22,1)" }} />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div><div className="text-3xl font-bold tabular-nums">{report.score}</div><div className="text-[10px] text-muted-foreground">/ 100</div></div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">AI Visibility Score</div>
                <div className={`text-2xl font-bold ${band(report.score).c}`}>{band(report.score).t}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {report.brand} appears in <b className="text-foreground">{report.results.filter((r) => r.mentioned).length}</b> of {report.results.length} AI answers.
                  <span className="block text-xs mt-1">Engine: {report.engine}{report.grounded ? " · live web" : ""}</span>
                </p>
              </div>
            </div>
            {report.competitors.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs text-muted-foreground mb-2">Getting recommended instead of you</div>
                <div className="flex flex-wrap gap-2">
                  {report.competitors.map((c) => <span key={c.name} className="rounded-full border px-3 py-1 text-sm">{c.name} <span className="text-muted-foreground">· {c.hits}×</span></span>)}
                </div>
              </div>
            )}
          </Card>

          <Card className="divide-y">
            {report.results.map((r, i) => (
              <div key={i}>
                <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center gap-3 p-4 text-left">
                  <span className={`h-6 w-6 rounded-full grid place-items-center shrink-0 ${r.mentioned ? "bg-success/15 text-success" : "bg-danger/10 text-danger"}`}>
                    {r.mentioned ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </span>
                  <span className="flex-1 min-w-0 text-sm">{r.prompt}</span>
                  {r.mentioned && r.position ? <span className="text-xs text-muted-foreground shrink-0">#{r.position}</span> : null}
                  <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
                </button>
                {open === i && (
                  <div className="px-4 pb-4 -mt-1">
                    <div className="text-xs text-muted-foreground mb-1">{r.engine}{r.competitorsFound.length ? ` · names: ${r.competitorsFound.join(", ")}` : ""}</div>
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap rounded-lg border bg-secondary/30 p-3 max-h-56 overflow-y-auto">{r.answer || "No answer."}</div>
                  </div>
                )}
              </div>
            ))}
          </Card>

          {fix && (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h3 className="font-semibold flex items-center gap-2"><Radar className="h-4 w-4 text-primary" /> The fix — get recommended by AI</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={saveFix} disabled={saved === "saving"}>
                    {saved === "done" ? <Check className="h-4 w-4" /> : <BrainCircuit className="h-4 w-4" />}{saved === "saving" ? "Saving…" : saved === "done" ? "Saved" : "Save to Memory"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyFix}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</Button>
                </div>
              </div>
              <div className="text-sm leading-7 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1"
                dangerouslySetInnerHTML={{ __html: mdToHtml(fix) }} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
