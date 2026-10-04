"use client";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Upload, Sparkles, Download, Loader2, AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";

/*
  The client half of the workbook transform. The browser holds the file for
  the whole flow — nothing is uploaded to storage — and sends it twice: once
  with the instruction to get a plan, once with the approved plan to get the
  result. Every state the person can be in is drawn, including the failures,
  so a button never appears to do nothing.
*/

type Plan = {
  sheet: string; columns: string[]; rows: number;
  ops: unknown[]; describe: string[]; note: string;
  diff: {
    rowsBefore: number; rowsAfter: number; columnsBefore: string[]; columnsAfter: string[];
    added: string[]; removed: string[]; renamed: Array<{ from: string; to: string }>;
    subtotals: Array<{ group: string; sum: string; groups: number }>;
    sample: Array<Record<string, unknown>>;
    formulaColumns: Array<{ name: string; expr: string }>;
  };
  charged: number;
};

const EXAMPLES = [
  "Remove rows where Status is Paid, then sort by Amount largest first",
  "Add a column GST = Amount * 0.18 and a column Total = Amount + GST",
  "Keep only Party, Amount and Due date; remove duplicate parties",
  "Subtotal Amount by Party",
];

export function ExcelTransform() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<"plan" | "apply" | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<{ text: string; problems?: string[] } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() { setPlan(null); setError(null); setDone(null); }

  async function getPlan() {
    if (!file) { setError({ text: "Attach a .xlsx or .csv file first." }); return; }
    if (instruction.trim().length < 4) { setError({ text: "Say what you want changed." }); return; }
    setBusy("plan"); setError(null); setPlan(null); setDone(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("instruction", instruction);
      const r = await fetch("/api/transform/plan", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ ok: false, error: `The server answered ${r.status} without a readable body.` }));
      if (!j.ok) { setError({ text: j.error || "Could not plan that.", problems: j.problems }); return; }
      setPlan(j as Plan);
    } catch (e: any) {
      setError({ text: `Could not reach the server: ${e?.message || "network error"}. Nothing was changed.` });
    } finally { setBusy(null); }
  }

  async function apply() {
    if (!file || !plan) return;
    setBusy("apply"); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("ops", JSON.stringify(plan.ops));
      const r = await fetch("/api/transform/apply", { method: "POST", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => ({ error: `The server answered ${r.status}.` }));
        setError({ text: j.error || "Could not apply the plan.", problems: j.problems }); return;
      }
      const blob = await r.blob();
      const name = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "workbook-cortex.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setDone(name);
    } catch (e: any) {
      setError({ text: `Could not download the result: ${e?.message || "network error"}.` });
    } finally { setBusy(null); }
  }

  const I = "w-full rounded-md border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
          <label className="block">
            <span className="text-xs text-muted-foreground">1. Your file (.xlsx or .csv, up to 5 MB)</span>
            <div className="mt-1 flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv" className="sr-only" id="xl-file"
                onChange={(e) => { setFile(e.target.files?.[0] || null); reset(); }} />
              <label htmlFor="xl-file" className="inline-flex items-center gap-2 rounded-md border h-10 px-3 text-sm cursor-pointer hover:bg-accent">
                <Upload className="h-4 w-4" aria-hidden="true" /> {file ? "Change file" : "Choose file"}
              </label>
              {file && <span className="text-sm truncate" title={file.name}>{file.name} <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span></span>}
            </div>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">2. What should change?</span>
            <input className={`${I} mt-1`} value={instruction} onChange={(e) => { setInstruction(e.target.value); reset(); }}
              placeholder={EXAMPLES[0]} onKeyDown={(e) => { if (e.key === "Enter" && !busy) getPlan(); }} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => { setInstruction(ex); reset(); }}
              className="rounded-full border px-3 h-7 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">{ex}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={getPlan} disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium disabled:opacity-60">
            {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {busy === "plan" ? "Planning…" : "Show me the plan"}
          </button>
          <span className="text-xs text-muted-foreground">Nothing is changed until you approve the plan below.</span>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-destructive/30 bg-destructive/5 text-sm flex items-start gap-2" role="alert">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <div>{error.text}</div>
            {error.problems && error.problems.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{error.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            )}
          </div>
        </Card>
      )}

      {plan && (
        <Card className="p-5 space-y-4">
          <div>
            <div className="text-sm font-medium">3. The plan — read it before you approve</div>
            <ol className="mt-2 list-decimal pl-5 text-sm space-y-1">{plan.describe.map((d, i) => <li key={i}>{d}</li>)}</ol>
            {plan.note && <p className="mt-2 text-xs text-muted-foreground italic">{plan.note}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Rows</div>
              <div className="font-medium">{plan.diff.rowsBefore.toLocaleString("en-IN")} → {plan.diff.rowsAfter.toLocaleString("en-IN")}</div>
              {plan.diff.rowsAfter < plan.diff.rowsBefore && <div className="text-xs text-muted-foreground">{(plan.diff.rowsBefore - plan.diff.rowsAfter).toLocaleString("en-IN")} removed</div>}
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Columns</div>
              <div className="font-medium">{plan.diff.columnsBefore.length} → {plan.diff.columnsAfter.length}</div>
              <div className="text-xs text-muted-foreground">
                {plan.diff.added.length > 0 && <span>+ {plan.diff.added.join(", ")} </span>}
                {plan.diff.removed.length > 0 && <span>− {plan.diff.removed.join(", ")} </span>}
                {plan.diff.renamed.map((r) => <span key={r.from}>{r.from} → {r.to} </span>)}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Live formulas</div>
              <div className="font-medium">{plan.diff.formulaColumns.length || "none"}</div>
              <div className="text-xs text-muted-foreground">{plan.diff.formulaColumns.map((f) => `${f.name} = ${f.expr}`).join("; ")}</div>
            </div>
          </div>

          {plan.diff.sample.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>{plan.diff.columnsAfter.map((c) => <th key={c} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{c}{plan.diff.added.includes(c) && <span className="ml-1 text-primary">new</span>}</th>)}</tr>
                </thead>
                <tbody>
                  {plan.diff.sample.map((r, i) => (
                    <tr key={i} className="border-t">{plan.diff.columnsAfter.map((c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? "")}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <div className="px-2 py-1.5 text-xs text-muted-foreground border-t">First {plan.diff.sample.length} of {plan.diff.rowsAfter.toLocaleString("en-IN")} rows after the change.</div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button type="button" onClick={apply} disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium disabled:opacity-60">
              {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              {busy === "apply" ? "Building…" : "Approve & download"}
            </button>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border h-10 px-3 text-sm hover:bg-accent">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Change the request
            </button>
          </div>
        </Card>
      )}

      {done && (
        <Card className="p-4 border-success/30 bg-success/5 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          Downloaded <span className="font-medium">{done}</span>. It is recorded in your Approvals history. Your original file is untouched.
        </Card>
      )}
    </div>
  );
}
