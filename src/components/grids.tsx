"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table2, Plus, Play, Loader2, Download, Trash2, Search, Check, AlertTriangle, X, Quote, ExternalLink, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeliverableBar } from "@/components/deliverable-bar";
import { cellKey, newId, FORMATS, FORMAT_LABEL, GRID_LIMITS, type Grid, type GridColumn, type CellFormat } from "@/lib/grids/core";

/*
  GRIDS — documents × questions, each cell quoted and checked.
  The run loop calls /api/grids/[id]/run until it reports done or out of
  credits; each call answers one batch, so nothing runs long and progress
  shows as it lands.
*/

type Progress = { total: number; done: number; verified: number; notFound: number; errors: number; remaining: number };

const TEMPLATES: { name: string; columns: { question: string; format: CellFormat }[] }[] = [
  { name: "Contract review", columns: [
    { question: "Who are the parties?", format: "text" }, { question: "What are the payment terms (days)?", format: "number" },
    { question: "When does it expire or renew?", format: "date" }, { question: "Is there a limitation of liability cap?", format: "yes_no" },
    { question: "What is the termination notice period?", format: "text" } ] },
  { name: "Vendor due diligence", columns: [
    { question: "What does the vendor supply?", format: "text" }, { question: "Is the vendor registered as an MSME (Udyam)?", format: "yes_no" },
    { question: "What GSTIN is stated?", format: "text" }, { question: "What penalties or service levels apply?", format: "text" } ] },
  { name: "Board and lender emails", columns: [
    { question: "What is being asked of us?", format: "text" }, { question: "Is there a deadline?", format: "date" },
    { question: "What amount is mentioned?", format: "number" }, { question: "Is a document still pending from us?", format: "yes_no" } ] },
];

export function GridsList() {
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/grids", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD({ ok: false, error: "Could not load grids." })); }, []);

  async function create(name: string, columns: { question: string; format: CellFormat }[]) {
    setBusy(true);
    try {
      const j = await (await fetch("/api/grids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, columns: columns.map((c) => ({ ...c, id: newId() })) }) })).json();
      if (j.ok) router.push(`/grids/${j.grid.id}`); else alert(j.error || "Could not create the grid.");
    } finally { setBusy(false); }
  }

  if (!d) return <Card className="p-5 text-sm text-muted-foreground flex gap-2 items-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</Card>;
  if (!d.ok) return <Card className="p-5 text-sm">{d.error}</Card>;

  return (
    <div className="space-y-6">
      {!d.ready && <Card className="p-4 text-sm border-warning/30 bg-warning/10">Grids needs its table: run <code>supabase/RUN-2026-11-20-grids.sql</code> in Supabase.</Card>}
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Table2 className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h2 className="font-semibold">Start a grid</h2>
            <p className="text-sm text-muted-foreground mt-1">Pick documents from Company Knowledge as rows and write your questions as columns. Cortex answers every cell from its own document, quotes the line that supports it, and checks the quote is really there. Each cell costs one document read in credits; failed cells are refunded.</p>
          </div>
        </div>
        {d.canEdit && d.ready && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => create("Untitled grid", [])} disabled={busy}><Plus className="h-4 w-4" /> Blank grid</Button>
            {TEMPLATES.map((t) => <Button key={t.name} variant="outline" onClick={() => create(t.name, t.columns)} disabled={busy}>{t.name}</Button>)}
          </div>
        )}
      </Card>
      {d.grids.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {d.grids.map((g: any) => (
            <Link key={g.id} href={`/grids/${g.id}`} className="rounded-xl border bg-card p-4 hover:bg-accent/40 transition-colors">
              <div className="font-medium">{g.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{g.rows} documents × {g.columns} questions · updated {String(g.updated_at || "").slice(0, 10)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function GridEditor({ id }: { id: string }) {
  const router = useRouter();
  const [g, setG] = useState<Grid | null>(null);
  const [p, setP] = useState<Progress | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [newQ, setNewQ] = useState("");
  const [newF, setNewF] = useState<CellFormat>("text");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await (await fetch(`/api/grids/${id}`, { cache: "no-store" })).json();
    if (!j.ok) { setErr(j.error); return; }
    setG(j.grid); setP(j.progress); setCanEdit(j.canEdit);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function patch(body: any) {
    const j = await (await fetch(`/api/grids/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    if (j.ok) { setG(j.grid); setP(j.progress); } else setErr(j.error);
  }

  async function search() {
    const j = await (await fetch(`/api/grids/documents?q=${encodeURIComponent(q)}`)).json();
    setHits(j.items || []);
  }
  useEffect(() => { if (picker) search(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [picker]);

  async function run() {
    setRunning(true); stop.current = false; setErr(null);
    try {
      for (let i = 0; i < 200 && !stop.current; i++) {
        const j = await (await fetch(`/api/grids/${id}/run`, { method: "POST" })).json();
        if (!j.ok) { setErr(j.error); break; }
        setG(j.grid); setP(j.progress);
        if (j.stopped === "credits") { setErr("Out of credits — top up and press Run to finish the remaining cells."); break; }
        if (j.stopped !== "batch") break;
      }
    } finally { setRunning(false); }
  }

  if (err && !g) return <Card className="p-5 text-sm">{err}</Card>;
  if (!g || !p) return <Card className="p-5 text-sm text-muted-foreground flex gap-2 items-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</Card>;

  const addColumn = () => {
    if (newQ.trim().length < 3) return;
    patch({ columns: [...g.columns, { id: newId(), question: newQ.trim(), format: newF }] }); setNewQ("");
  };
  const openCell = open ? g.cells[open] : null;
  const [openRow, openCol] = open ? [g.rows.find((r) => open.startsWith(r.id + ":")), g.columns.find((c) => open.endsWith(":" + c.id))] : [null, null];

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <input aria-label="Grid name" defaultValue={g.name} disabled={!canEdit} onBlur={(e) => e.target.value !== g.name && patch({ name: e.target.value })}
          className="text-lg font-semibold bg-transparent border-b border-transparent focus:border-border outline-none min-w-[12rem] flex-1" />
        <span className="text-xs text-muted-foreground">{p.done} of {p.total} cells · {p.verified} quoted & checked{p.notFound ? ` · ${p.notFound} not in document` : ""}{p.errors ? ` · ${p.errors} to retry` : ""}</span>
        {canEdit && (running
          ? <Button variant="outline" onClick={() => { stop.current = true; }}><Pause className="h-4 w-4" /> Pause</Button>
          : <Button onClick={run} disabled={!p.remaining && !p.errors}><Play className="h-4 w-4" /> Run {p.remaining ? `${p.remaining} cells` : ""}</Button>)}
        <a href={`/api/grids/${id}/export`} className="inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm hover:bg-accent"><Download className="h-4 w-4" /> Excel</a>
        {canEdit && <DeliverableBar kind="grid" refId={id} exports={false} />}
        {canEdit && <Button variant="ghost" onClick={async () => { if (confirm("Delete this grid?")) { await fetch(`/api/grids/${id}`, { method: "DELETE" }); router.push("/grids"); } }}><Trash2 className="h-4 w-4" /></Button>}
      </Card>
      {running && <div className="h-1 rounded bg-border overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>}
      {err && <p className="text-sm text-warning" role="status">{err}</p>}

      {canEdit && (
        <Card className="p-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setPicker(true)} disabled={g.rows.length >= GRID_LIMITS.rows}><Plus className="h-4 w-4" /> Add documents</Button>
          <input aria-label="New question" value={newQ} onChange={(e) => setNewQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addColumn()} placeholder="Add a question, e.g. What are the payment terms?"
            className="h-9 flex-1 min-w-[14rem] rounded-md border bg-background px-3 text-sm" maxLength={GRID_LIMITS.question} />
          <select aria-label="Answer format" value={newF} onChange={(e) => setNewF(e.target.value as CellFormat)} className="h-9 rounded-md border bg-background px-2 text-sm">
            {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
          <Button onClick={addColumn} disabled={newQ.trim().length < 3 || g.columns.length >= GRID_LIMITS.columns}>Add column</Button>
        </Card>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-secondary/40 align-bottom">
              <th scope="col" className="text-left p-3 min-w-[14rem] sticky left-0 bg-secondary/40">Document</th>
              {g.columns.map((c: GridColumn) => (
                <th key={c.id} scope="col" className="text-left p-3 min-w-[13rem] font-medium">
                  <div className="flex items-start gap-1">
                    <span className="flex-1">{c.question}<span className="block text-[10px] font-normal text-muted-foreground">{FORMAT_LABEL[c.format]}</span></span>
                    {canEdit && <button aria-label={`Remove column ${c.question}`} onClick={() => patch({ columns: g.columns.filter((x) => x.id !== c.id) })} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rows.length === 0 && <tr><td colSpan={g.columns.length + 1} className="p-6 text-center text-muted-foreground">Add documents from Company Knowledge to begin.</td></tr>}
            {g.rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 align-top">
                <th scope="row" className="text-left p-3 font-medium sticky left-0 bg-card">
                  <div className="flex items-start gap-1">
                    <span className="flex-1">{r.title}<span className="block text-[11px] font-normal text-muted-foreground line-clamp-2">{r.citation}</span></span>
                    {canEdit && <button aria-label={`Remove ${r.title}`} onClick={() => patch({ removeRows: [r.id] })} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                </th>
                {g.columns.map((c) => {
                  const k = cellKey(r.id, c.id); const x = g.cells[k];
                  return (
                    <td key={c.id} className="p-3">
                      {!x ? <span className="text-muted-foreground/60">—</span>
                        : x.status === "error" ? <span className="text-warning text-xs flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{x.error}</span>
                        : x.status === "not_found" ? <span className="text-muted-foreground italic">Not in document</span>
                        : <button onClick={() => setOpen(k)} className="text-left w-full group">
                            <span>{x.answer}</span>
                            <span className={`mt-1 flex items-center gap-1 text-[11px] ${x.verified ? "text-success" : "text-warning"}`}>
                              {x.verified ? <><Check className="h-3 w-3" /> Quoted & checked</> : <><AlertTriangle className="h-3 w-3" /> Quote not found — check</>}
                            </span>
                          </button>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openCell && openRow && openCol && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setOpen(null)}>
          <Card className="max-w-xl w-full p-5 space-y-3" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-start gap-2"><p className="flex-1 font-semibold">{openCol.question}</p><button aria-label="Close" onClick={() => setOpen(null)} className="-m-3 min-h-11 min-w-11 grid place-items-center"><X className="h-4 w-4" /></button></div>
            <p>{openCell.answer}</p>
            <blockquote className="border-l-2 border-primary pl-3 text-sm text-muted-foreground flex gap-2"><Quote className="h-4 w-4 shrink-0" />{openCell.quote || "No quote returned."}</blockquote>
            <p className={`text-xs ${openCell.verified ? "text-success" : "text-warning"}`}>{openCell.verified ? "Cortex found this exact quote in the document." : "Cortex could not find this quote word for word in the document. Check the source before relying on it."}</p>
            <p className="text-xs text-muted-foreground">{openRow.citation}</p>
            {openRow.url && <a href={openRow.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 underline">Open the original <ExternalLink className="h-3 w-3" /></a>}
          </Card>
        </div>
      )}

      {picker && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setPicker(false)}>
          <Card className="max-w-2xl w-full p-5 space-y-3 max-h-[85vh] flex flex-col" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center gap-2"><p className="flex-1 font-semibold">Add documents</p><button aria-label="Close" onClick={() => setPicker(false)} className="-m-3 min-h-11 min-w-11 grid place-items-center"><X className="h-4 w-4" /></button></div>
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search Company Knowledge — contracts, emails, reports…" className="h-9 flex-1 rounded-md border bg-background px-3 text-sm" />
              <Button variant="outline" onClick={search}><Search className="h-4 w-4" /></Button>
            </div>
            <ul className="overflow-y-auto divide-y border rounded-md flex-1">
              {hits.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nothing found. Upload documents or connect Microsoft 365 / Google Workspace in <Link href="/knowledge" className="underline">Company Knowledge</Link>.</li>}
              {hits.map((h) => (
                <li key={h.id}><label className="flex gap-3 p-3 text-sm cursor-pointer hover:bg-accent/40">
                  <input type="checkbox" checked={chosen.has(h.id)} onChange={() => { const n = new Set(chosen); n.has(h.id) ? n.delete(h.id) : n.add(h.id); setChosen(n); }} />
                  <span><span className="font-medium">{h.title || "Untitled"}</span><span className="block text-xs text-muted-foreground">{h.citation}</span></span>
                </label></li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPicker(false)}>Cancel</Button>
              <Button disabled={!chosen.size} onClick={async () => { await patch({ addItems: Array.from(chosen) }); setChosen(new Set()); setPicker(false); }}>Add {chosen.size || ""}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
