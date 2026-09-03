"use client";
import { refreshDerivedPages } from "@/lib/refresh";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Landmark, Upload, Loader2, ArrowDownLeft, ArrowUpRight, Wallet, BrainCircuit, Check, AlertTriangle, Repeat, BarChart3, Activity, Users } from "lucide-react";

type Cat = { category: string; outflow: number; share: number };
type MonthPoint = { key: string; label: string; inflow: number; outflow: number; net: number };
type Recurring = { desc: string; count: number; total: number; avg: number; category: string };
type Party = { name: string; total: number; count: number };
type Signal = { label: string; tone: "good" | "warn" | "bad" | "info"; detail: string };
type Analysis = {
  currency: string; period: string; count: number; inflow: number; outflow: number; net: number;
  opening: number | null; closing: number | null;
  avgTxn: number; netMarginPct: number | null; topCategoryShare: number;
  burnPerMonth: number | null; runwayMonths: number | null;
  byCategory: Cat[]; monthly: MonthPoint[]; recurring: Recurring[];
  counterpartiesOut: Party[]; counterpartiesIn: Party[];
  topExpenses: { desc: string; amount: number; date: string; category: string }[];
  topInflows: { desc: string; amount: number; date: string }[];
  signals: Signal[]; health: { score: number; label: string };
  insights: string[]; summaryMd: string; transactions: number;
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const toneDot: Record<string, string> = { good: "bg-success", warn: "bg-warning", bad: "bg-danger", info: "bg-primary" };
const healthColor = (s: number) => (s >= 75 ? "text-success" : s >= 55 ? "text-primary" : s >= 35 ? "text-warning" : "text-danger");

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
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i); const tc = await pg.getTextContent();
    out += tc.items.map((x: any) => x.str).join(" ") + "\n";
    if (out.length > 18000) break;
  }
  return out;
}

/**
 * The model has a context limit, so very long statements are trimmed. The
 * customer MUST be told: they pay credits for this, and an analysis of the
 * first two months of a twelve-month statement — presented as a full reading —
 * is worse than no analysis at all. `truncated` drives a visible warning.
 */
const MAX_CHARS = 18000;

export function BankStatementPanel() {
  const [text, setText] = useState("");
  const [truncated, setTruncated] = useState(false);
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
    try {
      const t = (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) ? await extractPdf(f) : await f.text();
      setTruncated(t.length > MAX_CHARS);
      setText(t.slice(0, MAX_CHARS));
    } catch { setErr("Couldn't read that file — please paste the transaction rows instead."); }
    finally { setReading(false); }
  }

  async function run() {
    if (text.trim().length < 40) { setErr("Upload or paste a bank statement first."); return; }
    setLoading(true); setErr(""); setA(null); setSaved("idle");
    try {
      const r = await fetch("/api/bank/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!j.ok) setErr(j.error || "Analysis failed.");
      else {
        setA(j.analysis);
        // This wrote finance_ledger and recomputed health_metrics. Without
        // this call, clicking "Dashboard" within ~30s shows the numbers from
        // BEFORE the upload — Next's client Router Cache still holds them.
        try { await refreshDerivedPages(); } catch { /* cosmetic only */ }
      }
    } catch { setErr("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  async function save() {
    if (!a || saved === "saving") return;
    setSaved("saving");
    const content = `${a.summaryMd}\n\nTop expenses:\n${a.topExpenses.map((t) => `- ${t.desc} — ${inr(t.amount)} (${t.category})`).join("\n")}`;
    try {
      const r = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `Bank statement — ${a.period}`, content, kind: "fact" }) });
      setSaved(r.ok ? "done" : "idle"); if (r.ok) setTimeout(() => setSaved("idle"), 3000);
    } catch { setSaved("idle"); }
  }

  const mMax = a && a.monthly.length ? Math.max(1, ...a.monthly.map((m) => Math.max(m.inflow, m.outflow))) : 1;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.pdf,.txt,text/csv,application/pdf" className="hidden" onChange={onFile} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={reading}>
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {reading ? "Reading…" : "Upload statement (CSV / PDF)"}
          </Button>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>
        {truncated && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
            <span>
              That file is longer than Cortex can read in one pass, so only the first part was
              loaded — the analysis below will cover that portion, not the whole document.
              For a long statement, upload one month at a time for a complete reading.
            </span>
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="…or paste your transaction rows here (date, description, amount, type)" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} {loading ? "Reading your money…" : "Analyse statement"}
          </Button>
          <span className="text-xs text-muted-foreground">Runs on your device + AI · 8 credits · nothing is stored unless you save it</span>
        </div>
        {err && <div className="flex items-start gap-2 text-sm text-danger"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {err}</div>}
      </Card>

      {a && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowDownLeft className="h-4 w-4 text-success" /> Money in</div><div className="text-2xl font-bold mt-1">{inr(a.inflow)}</div></Card>
            <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowUpRight className="h-4 w-4 text-danger" /> Money out</div><div className="text-2xl font-bold mt-1">{inr(a.outflow)}</div></Card>
            <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4 text-primary" /> Net cash flow</div><div className={`text-2xl font-bold mt-1 ${a.net >= 0 ? "text-success" : "text-danger"}`}>{a.net >= 0 ? "+" : "−"}{inr(Math.abs(a.net))}</div></Card>
          </div>

          {/* Cashflow health + signals */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center"><Activity className="h-6 w-6 text-primary" /></div>
                <div>
                  <div className="text-sm text-muted-foreground">Cashflow health · {a.period}</div>
                  <div className={`text-2xl font-bold ${healthColor(a.health.score)}`}>{a.health.label} <span className="text-base font-medium text-muted-foreground">· {a.health.score}/100</span></div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><div className="text-muted-foreground text-xs">Net margin</div><div className="font-semibold">{a.netMarginPct != null ? `${a.netMarginPct}%` : "—"}</div></div>
                <div><div className="text-muted-foreground text-xs">Avg txn</div><div className="font-semibold">{inr(a.avgTxn)}</div></div>
                <div><div className="text-muted-foreground text-xs">Runway</div><div className="font-semibold">{a.runwayMonths != null ? `${a.runwayMonths} mo` : "—"}</div></div>
              </div>
            </div>
            {a.signals.length > 0 && (
              <div className="mt-4 grid sm:grid-cols-2 gap-2">
                {a.signals.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm rounded-lg border p-2.5">
                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${toneDot[s.tone] || "bg-primary"}`} />
                    <span><b>{s.label}.</b> <span className="text-muted-foreground">{s.detail}</span></span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Monthly trend */}
          {a.monthly.length > 1 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-primary" /> Month by month</h3>
              <div className="space-y-3">
                {a.monthly.map((m) => (
                  <div key={m.key}>
                    <div className="flex justify-between text-xs mb-1"><span className="font-medium">{m.label}</span><span className="text-muted-foreground">net {m.net >= 0 ? "+" : "−"}{inr(Math.abs(m.net))}</span></div>
                    <div className="flex gap-1 items-center">
                      <div className="h-2.5 rounded-full bg-success/80" style={{ width: `${Math.max(2, (m.inflow / mMax) * 100)}%` }} title={`In ${inr(m.inflow)}`} />
                    </div>
                    <div className="flex gap-1 items-center mt-1">
                      <div className="h-2.5 rounded-full bg-danger/80" style={{ width: `${Math.max(2, (m.outflow / mMax) * 100)}%` }} title={`Out ${inr(m.outflow)}`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success/80" /> Money in</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger/80" /> Money out</span></div>
            </Card>
          )}

          {a.byCategory.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Where the money went · {a.period}</h3>
              <div className="space-y-2.5">
                {a.byCategory.slice(0, 8).map((c) => (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm mb-1"><span>{c.category}</span><span className="text-muted-foreground">{inr(c.outflow)} · {c.share}%</span></div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${c.share}%` }} /></div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recurring payments */}
          {a.recurring.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm"><Repeat className="h-4 w-4 text-primary" /> Recurring payments &amp; subscriptions</h3>
              <div className="divide-y">
                {a.recurring.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="truncate">{r.desc}<span className="text-muted-foreground text-xs"> · {r.category} · ×{r.count}</span></span>
                    <span className="font-medium shrink-0">{inr(r.total)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <Card className="p-5">
              <h3 className="font-semibold mb-3 text-sm">Biggest outflows</h3>
              <div className="space-y-2">
                {a.topExpenses.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{t.desc || t.category}<span className="text-muted-foreground text-xs"> · {t.category}</span></span>
                    <span className="font-medium shrink-0 text-danger">−{inr(t.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold mb-3 text-sm">Biggest inflows</h3>
              <div className="space-y-2">
                {a.topInflows.length ? a.topInflows.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{t.desc}</span><span className="font-medium shrink-0 text-success">+{inr(t.amount)}</span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No credits detected.</p>}
              </div>
            </Card>
          </div>

          {/* Top counterparties */}
          {(a.counterpartiesOut.length > 0 || a.counterpartiesIn.length > 0) && (
            <div className="grid md:grid-cols-2 gap-3">
              <Card className="p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-danger" /> Top payees</h3>
                <div className="space-y-2">
                  {a.counterpartiesOut.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm gap-2"><span className="truncate">{p.name}<span className="text-muted-foreground text-xs"> · ×{p.count}</span></span><span className="font-medium shrink-0">{inr(p.total)}</span></div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-success" /> Top payers</h3>
                <div className="space-y-2">
                  {a.counterpartiesIn.length ? a.counterpartiesIn.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm gap-2"><span className="truncate">{p.name}<span className="text-muted-foreground text-xs"> · ×{p.count}</span></span><span className="font-medium shrink-0">{inr(p.total)}</span></div>
                  )) : <p className="text-sm text-muted-foreground">No credits detected.</p>}
                </div>
              </Card>
            </div>
          )}

          {a.insights.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3 text-sm">What Cortex sees</h3>
              <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">{a.insights.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border bg-primary/5 p-4">
            <div className="text-sm"><b>Ground your whole workspace in this.</b> Save it to Cortex Memory so your Ask Cortex, Deep Dive and your weekly brief use these real numbers.</div>
            <Button onClick={save} disabled={saved === "saving"}>
              {saved === "done" ? <Check className="h-4 w-4" /> : <BrainCircuit className="h-4 w-4" />}{saved === "saving" ? "Saving…" : saved === "done" ? "Saved to Memory" : "Save to Cortex Memory"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
