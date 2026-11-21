"use client";
import { useState } from "react";
import { Loader2, ShieldCheck, AlertTriangle, GitCompare, Upload, Check } from "lucide-react";

/*
  DOCUMENT REVIEW — check a document before it leaves the company: placeholders,
  totals that don't add up, figures stated two ways, contradictions; and, with
  the previous draft, exactly what changed. Issues are sorted by severity, and
  an AI-found issue whose quote is not in the document says so.
*/
const SEV: Record<string, string> = { high: "bg-danger/15 text-danger", medium: "bg-warning/20 text-warning", low: "bg-muted text-muted-foreground" };

export function DocumentReview() {
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    if (!file) return;
    setBusy(true); setErr(null); setR(null);
    try {
      const fd = new FormData(); fd.append("file", file); if (prev) fd.append("previous", prev); fd.append("purpose", purpose);
      const j = await (await fetch("/api/review", { method: "POST", body: fd })).json();
      if (!j.ok) setErr(j.error); else setR(j);
    } catch { setErr("Could not reach Cortex."); } finally { setBusy(false); }
  }
  const counts = r ? { high: r.issues.filter((i: any) => i.severity === "high").length, medium: r.issues.filter((i: any) => i.severity === "medium").length, low: r.issues.filter((i: any) => i.severity === "low").length } : null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 font-medium text-sm"><ShieldCheck className="h-4 w-4 text-primary" /> Review before it goes out</div>
      <p className="text-xs text-muted-foreground">Board packs, lender notes, investor updates, contract drafts. Code checks (placeholders, repeated words, mixed formats) are free; the AI review of totals, consistency and contradictions costs one document analysis. Add the previous draft to see what changed.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 rounded-md border px-3 h-9 text-sm cursor-pointer hover:bg-accent"><Upload className="h-4 w-4" /> {file ? file.name : "Document"}<input type="file" className="sr-only" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
        <label className="inline-flex items-center gap-2 rounded-md border px-3 h-9 text-sm cursor-pointer hover:bg-accent"><GitCompare className="h-4 w-4" /> {prev ? prev.name : "Previous draft (optional)"}<input type="file" className="sr-only" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md" onChange={(e) => setPrev(e.target.files?.[0] || null)} /></label>
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Who is it for? e.g. our lender" className="h-9 rounded-md border bg-background px-3 text-sm min-w-[12rem]" maxLength={120} />
        <button onClick={go} disabled={!file || busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 h-9 text-sm font-medium disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Review</button>
      </div>
      {err && <p className="text-xs text-warning">{err}</p>}
      {r && (
        <div className="space-y-4">
          <p className="text-sm">{r.issues.length === 0 ? <span className="inline-flex items-center gap-1.5 text-success"><Check className="h-4 w-4" /> No issues found.</span> : <>{r.issues.length} issue{r.issues.length === 1 ? "" : "s"}: <b>{counts!.high}</b> high · <b>{counts!.medium}</b> medium · <b>{counts!.low}</b> low</>}{r.truncated && <span className="text-xs text-muted-foreground"> · long document: the AI read the first 60,000 characters</span>}</p>
          {r.aiNote && <p className="text-xs text-muted-foreground">{r.aiNote}</p>}
          <ul className="space-y-2">
            {r.issues.map((i: any, k: number) => (
              <li key={k} className="rounded-lg border bg-background/60 p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEV[i.severity]}`}>{i.severity}</span><span className="text-xs text-muted-foreground capitalize">{i.category}</span><span className="text-[10px] text-muted-foreground">{i.source === "check" ? "code check" : "AI review"}</span></div>
                <p>{i.issue}</p>
                {i.quote && <p className="text-xs text-muted-foreground border-l-2 pl-2">&ldquo;{i.quote}&rdquo;{i.source === "ai" && !i.verified && <span className="ml-1 text-warning inline-flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" /> not found word for word — check</span>}</p>}
                {i.fix && <p className="text-xs"><span className="font-medium">Fix:</span> {i.fix}</p>}
              </li>
            ))}
          </ul>
          {r.changes && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><GitCompare className="h-4 w-4" /> What changed since the previous draft ({r.changes.length})</p>
              <ul className="space-y-1.5 text-xs max-h-96 overflow-y-auto">
                {r.changes.map((c: any, k: number) => (
                  <li key={k} className="rounded-md border p-2">
                    {c.kind === "added" && <p><span className="text-success font-medium">Added:</span> {c.after}</p>}
                    {c.kind === "removed" && <p><span className="text-danger font-medium">Removed:</span> <span className="line-through">{c.before}</span></p>}
                    {c.kind === "changed" && <><p><span className="text-warning font-medium">Changed:</span> <span className="line-through text-muted-foreground">{c.before}</span></p><p className="pl-14">{c.after}</p>{c.figures && <p className="pl-14 text-warning">Figures: {c.figures.before.join(", ") || "—"} → {c.figures.after.join(", ") || "—"}</p>}</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
