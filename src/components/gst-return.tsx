"use client";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt, Upload, Loader2, BrainCircuit, Check, AlertTriangle, CheckCircle2, Circle, ListChecks } from "lucide-react";

type GstCheck = { label: string; ok: boolean };
type GstSignal = { label: string; tone: "good" | "warn" | "bad" | "info"; detail: string };
type Analysis = {
  period: string; gstin: string | null; taxableTurnover: number;
  igst: number; cgst: number; sgst: number; cess: number; totalTax: number;
  itcAvailable: number; netPayable: number;
  effectiveRatePct: number | null; itcUtilPct: number | null; itcCarryForward: number;
  composition: { igst: number; cgst: number; sgst: number; cess: number };
  checklist: GstCheck[]; signals: GstSignal[];
  insights: string[]; summaryMd: string;
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const toneDot: Record<string, string> = { good: "bg-success", warn: "bg-warning", bad: "bg-danger", info: "bg-primary" };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return reject();
    if ([...document.scripts].some((sc) => sc.src === src)) return resolve();
    const el = document.createElement("script"); el.src = src; el.onload = () => resolve(); el.onerror = () => reject();
    document.head.appendChild(el);
  });
}
async function extractPdf(f: File): Promise<string> {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js");
  const pdfjs: any = (window as any).pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
  const data = await f.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const tc = await pg.getTextContent(); out += tc.items.map((x: any) => x.str).join(" ") + "\n"; if (out.length > 16000) break; }
  return out;
}

export function GstReturnPanel() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [a, setA] = useState<Analysis | null>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setReading(true); setErr(""); setFileName(f.name);
    try { const t = (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) ? await extractPdf(f) : await f.text(); setText(t.slice(0, 16000)); }
    catch { setErr("Couldn't read that file — please paste the summary instead."); }
    finally { setReading(false); }
  }

  async function run() {
    if (text.trim().length < 30) { setErr("Upload or paste a GST return first."); return; }
    setLoading(true); setErr(""); setA(null); setSaved("idle");
    try {
      const r = await fetch("/api/gst/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json(); if (!j.ok) setErr(j.error || "Analysis failed."); else setA(j.analysis);
    } catch { setErr("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  async function save() {
    if (!a || saved === "saving") return; setSaved("saving");
    try { const r = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `GST return — ${a.period}`, content: a.summaryMd, kind: "fact" }) }); setSaved(r.ok ? "done" : "idle"); if (r.ok) setTimeout(() => setSaved("idle"), 3000); }
    catch { setSaved("idle"); }
  }

  const cards = a ? [
    { l: "Taxable turnover", v: inr(a.taxableTurnover) },
    { l: "Total output tax", v: inr(a.totalTax) },
    { l: "ITC available", v: inr(a.itcAvailable) },
    { l: "Net GST payable", v: inr(a.netPayable), hl: true },
    { l: "Effective rate", v: a.effectiveRatePct != null ? `${a.effectiveRatePct}%` : "—" },
    { l: "ITC utilisation", v: a.itcUtilPct != null ? `${a.itcUtilPct}%` : "—" },
  ] : [];

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.pdf,.txt,text/csv,application/pdf" className="hidden" onChange={onFile} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={reading}>
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {reading ? "Reading…" : "Upload GST return (CSV / PDF)"}
          </Button>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="…or paste your GSTR-3B / GSTR-1 / 2B summary here" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} {loading ? "Reading your return…" : "Analyse GST return"}
          </Button>
          <span className="text-xs text-muted-foreground">Read on your device + AI · 8 credits</span>
        </div>
        {err && <div className="flex items-start gap-2 text-sm text-danger"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {err}</div>}
      </Card>

      {a && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((c) => (
              <Card key={c.l} className={`p-4 ${c.hl ? "border-primary/40 bg-primary/5" : ""}`}>
                <div className="text-xs text-muted-foreground">{c.l}</div>
                <div className={`text-xl font-bold mt-1 ${c.hl ? "text-primary" : ""}`}>{c.v}</div>
              </Card>
            ))}
          </div>

          <Card className="p-5">
            <h3 className="font-semibold mb-3 text-sm">Tax breakdown · {a.period}{a.gstin ? ` · ${a.gstin}` : ""}</h3>
            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border p-3"><div className="text-muted-foreground text-xs">IGST · {a.composition.igst}%</div><div className="font-medium">{inr(a.igst)}</div></div>
              <div className="rounded-lg border p-3"><div className="text-muted-foreground text-xs">CGST · {a.composition.cgst}%</div><div className="font-medium">{inr(a.cgst)}</div></div>
              <div className="rounded-lg border p-3"><div className="text-muted-foreground text-xs">SGST · {a.composition.sgst}%</div><div className="font-medium">{inr(a.sgst)}</div></div>
              <div className="rounded-lg border p-3"><div className="text-muted-foreground text-xs">Cess · {a.composition.cess}%</div><div className="font-medium">{inr(a.cess)}</div></div>
            </div>
            {/* composition bar */}
            {a.totalTax > 0 && (
              <div className="mt-4 h-2.5 w-full rounded-full overflow-hidden flex">
                <div className="h-full bg-primary" style={{ width: `${a.composition.igst}%` }} title={`IGST ${a.composition.igst}%`} />
                <div className="h-full bg-success" style={{ width: `${a.composition.cgst}%` }} title={`CGST ${a.composition.cgst}%`} />
                <div className="h-full bg-warning" style={{ width: `${a.composition.sgst}%` }} title={`SGST ${a.composition.sgst}%`} />
                <div className="h-full bg-muted-foreground" style={{ width: `${a.composition.cess}%` }} title={`Cess ${a.composition.cess}%`} />
              </div>
            )}
            {a.itcCarryForward > 0 && <p className="mt-3 text-xs text-muted-foreground">Unused ITC carried forward: <b>{inr(a.itcCarryForward)}</b></p>}
          </Card>

          <div className="grid md:grid-cols-2 gap-3">
            {/* Filing readiness */}
            <Card className="p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm"><ListChecks className="h-4 w-4 text-primary" /> Filing-readiness check</h3>
              <div className="space-y-2">
                {a.checklist.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {c.ok ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                  </div>
                ))}
              </div>
            </Card>
            {/* Signals */}
            <Card className="p-5">
              <h3 className="font-semibold mb-3 text-sm">What Cortex sees</h3>
              <div className="space-y-2">
                {a.signals.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${toneDot[s.tone] || "bg-primary"}`} />
                    <span><b>{s.label}.</b> <span className="text-muted-foreground">{s.detail}</span></span>
                  </div>
                ))}
                {a.insights.map((s, i) => <div key={`i${i}`} className="flex items-start gap-2 text-sm"><span className="h-2 w-2 rounded-full mt-1.5 shrink-0 bg-primary/40" /><span className="text-muted-foreground">{s}</span></div>)}
              </div>
            </Card>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border bg-primary/5 p-4">
            <div className="text-sm"><b>Ground your workspace.</b> Save these figures to Cortex Memory so your AI answers use your real tax numbers.</div>
            <Button onClick={save} disabled={saved === "saving"}>
              {saved === "done" ? <Check className="h-4 w-4" /> : <BrainCircuit className="h-4 w-4" />}{saved === "saving" ? "Saving…" : saved === "done" ? "Saved to Memory" : "Save to Cortex Memory"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
