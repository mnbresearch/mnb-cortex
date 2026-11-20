"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Database, Mail, MessageSquare, FileText, Plug, Upload, RefreshCw, Pause, Play, Trash2, Search, Loader2, ShieldCheck, ExternalLink, Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Provider = { id: string; name: string; reads: string[]; blurb: string; allowedByPlan: boolean; configured: boolean; plan: string };
type Source = { id: string; provider: string; label: string; status: string; status_reason: string | null; account: string | null; item_count: number; last_synced_at: string | null; config: any };
type Hit = { id: string; citation: string; kind: string; title: string | null; author: string | null; date: string | null; url: string | null; excerpt: string };

const ICON: Record<string, any> = { microsoft365: Mail, google_workspace: Mail, mcp: Plug, upload: FileText };
const KIND_ICON: Record<string, any> = { email: Mail, chat: MessageSquare, document: FileText, file: FileText, report: FileText, record: Database };
const STATUS: Record<string, string> = { active: "text-success", paused: "text-muted-foreground", error: "text-danger", needs_reauth: "text-warning-foreground" };

export function CompanyKnowledge({ notice, error: initialError }: { notice?: string; error?: string }) {
  const [data, setData] = useState<{ sources: Source[]; providers: Provider[]; stats: { sources: number; items: number }; canManage: boolean } | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError || null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [mcp, setMcp] = useState({ url: "", token: "", label: "" });
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/knowledge/sources", { cache: "no-store" })).json();
      if (j.setup) setSetup(j.error); else if (j.ok) setData(j); else setError(j.error);
    } catch { setError("Could not load Company Knowledge."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(id + action); setError(null);
    try {
      const j = await (await fetch("/api/knowledge/sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, ...extra }) })).json();
      if (!j.ok && j.error) setError(j.error);
    } finally { setBusy(null); load(); }
  }

  async function addMcp() {
    setBusy("mcp"); setError(null);
    try {
      const j = await (await fetch("/api/knowledge/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mcp) })).json();
      if (!j.ok) setError(j.error); else setMcp({ url: "", token: "", label: "" });
    } finally { setBusy(null); load(); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload"); setUploadMsg(null); setError(null);
    const fd = new FormData();
    for (const f of Array.from(files).slice(0, 10)) fd.append("files", f);
    try {
      const j = await (await fetch("/api/knowledge/upload", { method: "POST", body: fd })).json();
      if (j.results) setUploadMsg(j.results.map((r: any) => r.ok ? `${r.name}: read (${r.parts} part${r.parts === 1 ? "" : "s"})` : `${r.name}: ${r.error}`).join(" · "));
      else setError(j.error);
    } catch { setError("Upload failed."); } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; load(); }
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy("search");
    try { const j = await (await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })).json(); setHits(j.ok ? j.hits : []); }
    finally { setBusy(null); }
  }

  if (setup) return <Card className="p-6 text-sm border-warning/30 bg-warning/10"><p className="font-semibold">One step left to switch on Company Knowledge</p><p className="mt-1 text-muted-foreground">{setup}</p></Card>;
  if (!data) return <Card className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</Card>;

  const can = data.canManage;
  return (
    <div className="space-y-5">
      {notice && <Card className="p-4 text-sm border-success/30 bg-success/10 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> {notice}</Card>}
      {error && <Card className="p-4 text-sm border-danger/30 bg-danger/10 flex items-start gap-2" role="alert"><AlertTriangle className="h-4 w-4 text-danger mt-0.5" /> {error}</Card>}

      <Card className="p-5 flex flex-wrap items-center gap-6">
        <div><p className="text-2xl font-semibold">{data.stats.items.toLocaleString("en-IN")}</p><p className="text-xs text-muted-foreground">emails, messages and document parts your agents can search</p></div>
        <div><p className="text-2xl font-semibold">{data.stats.sources}</p><p className="text-xs text-muted-foreground">connected sources</p></div>
        <div className="flex-1 min-w-[260px] text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>Read-only. Cortex never sends, deletes or changes anything in these accounts. Agents cite the email, chat or document behind every answer. Everyone in this workspace can search what is connected; only admins can connect or remove sources. Removing a source deletes everything read from it.</span>
        </div>
      </Card>

      {/* Connect */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.providers.map((p) => {
          const Icon = ICON[p.id] || Database;
          const locked = !p.allowedByPlan;
          return (
            <Card key={p.id} className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /><h2 className="font-semibold">{p.name}</h2>
                {locked && <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" />{p.plan === "workspace_connectors" ? "Command & Enterprise" : "Pro and above"}</span>}</div>
              <p className="text-sm text-muted-foreground">{p.blurb}</p>
              <ul className="text-xs text-muted-foreground list-disc pl-5">{p.reads.map((r) => <li key={r}>{r}</li>)}</ul>
              <div className="mt-auto">
                {locked ? <Link href="/billing" className="text-sm font-medium text-primary underline">See plans</Link>
                  : !can ? <p className="text-xs text-muted-foreground">An admin can connect this.</p>
                  : p.id === "microsoft365" || p.id === "google_workspace"
                    ? (p.configured
                        ? <div className="flex flex-wrap items-center gap-2">
                            <a href={`/api/knowledge/connect/${p.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90">Connect {p.name}</a>
                            <Link href="/settings#company-knowledge-connections" className="text-xs text-muted-foreground underline">Pairing settings</Link>
                          </div>
                        : <p className="text-xs text-muted-foreground">Pair it first under <Link href="/settings#company-knowledge-connections" className="underline">Settings → Company Knowledge connections</Link> — step by step, about ten minutes with your IT admin.</p>)
                  : p.id === "upload"
                    ? <div className="flex flex-wrap items-center gap-2">
                        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.csv,.tsv,.txt,.md,.json,.html,.htm,.eml" className="hidden" onChange={(e) => upload(e.target.files)} />
                        <Button onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>{busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload documents</Button>
                        <span className="text-[11px] text-muted-foreground">PDF, Word, Excel, CSV, text · up to 10 files, 15 MB each</span>
                        {uploadMsg && <p className="w-full text-xs text-muted-foreground">{uploadMsg}</p>}
                      </div>
                    : <div className="grid gap-2">
                        <input aria-label="MCP server URL" value={mcp.url} onChange={(e) => setMcp({ ...mcp, url: e.target.value })} placeholder="https://your-system.example.com/mcp" className="h-9 rounded-lg border bg-background px-3 text-sm" />
                        <div className="flex gap-2">
                          <input aria-label="Bearer token (optional)" type="password" value={mcp.token} onChange={(e) => setMcp({ ...mcp, token: e.target.value })} placeholder="Bearer token (optional)" className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm" />
                          <input aria-label="Name" value={mcp.label} onChange={(e) => setMcp({ ...mcp, label: e.target.value })} placeholder="Name, e.g. CRM" className="h-9 w-32 rounded-lg border bg-background px-3 text-sm" />
                        </div>
                        <Button onClick={addMcp} disabled={busy === "mcp" || !mcp.url}>{busy === "mcp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Connect MCP server</Button>
                      </div>}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Sources */}
      <Card className="p-5">
        <h2 className="font-semibold">Connected sources</h2>
        {!data.sources.length ? <p className="mt-2 text-sm text-muted-foreground">Nothing connected yet. Connect a mailbox, upload documents or add an MCP server above.</p> : (
          <ul className="mt-3 divide-y">
            {data.sources.map((s) => {
              const Icon = ICON[s.provider] || Database;
              return (
                <li key={s.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{s.label}</span>
                    <span className={`text-xs capitalize ${STATUS[s.status] || ""}`}>{s.status.replace("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">{s.item_count.toLocaleString("en-IN")} items{s.last_synced_at ? ` · synced ${new Date(s.last_synced_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                    {can && <div className="ml-auto flex gap-1">
                      {s.provider !== "upload" && <Button size="sm" variant="outline" onClick={() => act(s.id, "sync")} disabled={busy === s.id + "sync"}>{busy === s.id + "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now</Button>}
                      {s.status === "needs_reauth" && (s.provider === "microsoft365" || s.provider === "google_workspace") && <a href={`/api/knowledge/connect/${s.provider}`} className="inline-flex items-center rounded-lg border h-8 px-3 text-xs font-medium">Sign in again</a>}
                      {s.status !== "paused" ? <Button size="sm" variant="ghost" onClick={() => act(s.id, "pause")}><Pause className="h-3.5 w-3.5" /></Button> : <Button size="sm" variant="ghost" onClick={() => act(s.id, "resume")}><Play className="h-3.5 w-3.5" /></Button>}
                      <Button size="sm" variant="ghost" aria-label="Remove source" onClick={() => { if (confirm(`Remove ${s.label} and everything read from it?`)) act(s.id, "delete"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>}
                  </div>
                  {s.status_reason && <p className="mt-1 text-xs text-muted-foreground">{s.status_reason}</p>}
                  {s.provider === "mcp" && Array.isArray(s.config?.tools) && s.config.tools.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.config.tools.map((t: any) => {
                        const on = (s.config.allowed || []).includes(t.name);
                        return <button key={t.name} type="button" disabled={!can} title={t.description}
                          onClick={() => act(s.id, "allow", { allowed: on ? s.config.allowed.filter((n: string) => n !== t.name) : [...(s.config.allowed || []), t.name] })}
                          className={`rounded-md border px-2 py-0.5 text-[11px] ${on ? "bg-primary/10 border-primary/30 text-primary" : "text-muted-foreground"}`}>{on ? "✓ " : ""}{t.name}</button>;
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Search */}
      <Card className="p-5">
        <h2 className="font-semibold">Search what your agents can see</h2>
        <form onSubmit={search} className="mt-3 flex gap-2">
          <input aria-label="Search company knowledge" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. GST notice, Shree Balaji payment, travel policy" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" />
          <Button type="submit" disabled={busy === "search"}>{busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</Button>
        </form>
        {hits && (
          hits.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nothing found.</p> : (
            <ul className="mt-3 space-y-3">
              {hits.map((h) => {
                const K = KIND_ICON[h.kind] || FileText;
                return (
                  <li key={h.id} className="rounded-lg border p-3">
                    <div className="flex items-start gap-2 text-xs text-muted-foreground"><K className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span className="flex-1">{h.citation}</span>
                      {h.url && <a href={h.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Open <ExternalLink className="h-3 w-3" /></a>}</div>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap line-clamp-6">{h.excerpt}</p>
                  </li>
                );
              })}
            </ul>
          )
        )}
        <p className="mt-3 text-xs text-muted-foreground">Agents in the <Link href="/workspace" className="underline">Agent Workspace</Link> search the same sources, and name the email, chat or document behind each answer.</p>
      </Card>
    </div>
  );
}
