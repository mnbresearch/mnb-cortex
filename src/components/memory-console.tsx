"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Plus, Sparkles, Pin, Archive, WandSparkles, Loader2, Brain, Tag, GraduationCap } from "lucide-react";

type Memory = {
  id: string; kind: string; title: string | null; content: string; entities: string[];
  tags: string[]; importance: number; pinned: boolean; source: string; created_at: string;
};
type Entity = { id: string; name: string; type: string; mention_count: number };

const KINDS = ["fact", "preference", "decision", "insight", "instruction", "event"];
const kindColor: Record<string, string> = {
  fact: "bg-primary/10 text-primary", preference: "bg-accent text-foreground", decision: "bg-warning/10 text-warning",
  insight: "bg-success/10 text-success", instruction: "bg-primary/10 text-primary", event: "bg-muted text-muted-foreground",
};

async function api(url: string, opts?: RequestInit) { const r = await fetch(url, opts); return r.json().catch(() => ({})); }

export function MemoryConsole({ initialMemories, entities: initialEntities, profileMd, updatedAt }: {
  initialMemories: Memory[]; entities: Entity[]; profileMd: string | null; updatedAt: string | null;
}) {
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [entities] = useState<Entity[]>(initialEntities);
  const [profile, setProfile] = useState<string | null>(profileMd);
  const [profileTime, setProfileTime] = useState<string | null>(updatedAt);
  const [themes, setThemes] = useState<{ theme: string; summary: string; count: number }[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  // capture form
  const [cContent, setCContent] = useState("");
  const [cKind, setCKind] = useState("fact");
  const [cEntities, setCEntities] = useState("");
  const [cImportance, setCImportance] = useState(3);
  const [extractText, setExtractText] = useState("");

  const shown = memories.filter((m) => filter === "all" || m.kind === filter);

  async function search() {
    setBusy("search"); setMsg("");
    const j = await api(`/api/memory?mode=recall&q=${encodeURIComponent(q)}`);
    setMemories(j.items || []); setBusy("");
    if (!(j.items || []).length) setMsg("Nothing recalled for that query.");
  }
  async function reload() { const j = await api(`/api/memory`); setMemories(j.items || []); }

  async function capture() {
    if (!cContent.trim()) return;
    setBusy("capture"); setMsg("");
    const j = await api("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: cContent, kind: cKind, entities: cEntities, importance: cImportance }) });
    setBusy("");
    if (j.ok) { setCContent(""); setCEntities(""); await reload(); setMsg("Remembered."); } else setMsg(j.error || "Could not save.");
  }
  async function extract() {
    if (!extractText.trim()) return;
    setBusy("extract"); setMsg("");
    const j = await api("/api/memory/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: extractText }) });
    setBusy("");
    if (j.ok) { setExtractText(""); await reload(); setMsg(`Extracted ${j.count} memories.`); } else setMsg(j.error || "Extraction failed.");
  }
  async function pin(m: Memory) {
    await api("/api/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, op: "pin", pinned: !m.pinned }) });
    setMemories((xs) => xs.map((x) => x.id === m.id ? { ...x, pinned: !x.pinned } : x));
  }
  async function archive(m: Memory) {
    await api("/api/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, op: "archive" }) });
    setMemories((xs) => xs.filter((x) => x.id !== m.id));
  }
  async function regenProfile() {
    setBusy("profile"); setMsg("");
    const j = await api("/api/memory/profile", { method: "POST" });
    setBusy("");
    if (j.ok) { setProfile(j.profile_md); setProfileTime(new Date().toISOString()); } else setMsg(j.error || "Could not synthesize profile.");
  }
  async function runThemes() {
    setBusy("themes"); setMsg("");
    const j = await api("/api/memory/themes", { method: "POST" });
    setBusy("");
    setThemes(j.themes || []);
    if (!(j.themes || []).length) setMsg(j.error || "Not enough memories to cluster yet.");
  }
  async function teach() {
    setBusy("teach"); setMsg("");
    const j = await api("/api/memory/ingest", { method: "POST" });
    setBusy("");
    if (j.ok) { await reload(); setMsg(`Learned ${j.memories} memories and ${j.entities} entities from your data.`); }
    else setMsg(j.error || "Could not read your data.");
  }

  const I = "rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      {/* Recall */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className={I + " flex-1"} placeholder="Ask memory anything — “what did we decide about pricing?”" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <Button size="sm" onClick={search} disabled={busy === "search"}>{busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recall"}</Button>
          <Button size="sm" variant="outline" onClick={() => { setQ(""); reload(); }}>All</Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
          <div className="text-xs text-muted-foreground">New here? Let Cortex read your existing customers, team & KPIs and remember them.</div>
          <Button size="sm" variant="outline" onClick={teach} disabled={busy === "teach"}>
            {busy === "teach" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />} Teach Cortex from my data
          </Button>
        </div>
      </Card>

      {/* Living profile */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 font-semibold"><Brain className="h-4 w-4 text-primary" /> Living company profile</div>
          <Button size="sm" variant="outline" onClick={regenProfile} disabled={busy === "profile"}>
            {busy === "profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Re-synthesize
          </Button>
        </div>
        {profile ? (
          <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{profile}</div>
        ) : (
          <p className="text-sm text-muted-foreground">No profile yet. Capture some memories, then re-synthesize to build a living brief of your business.</p>
        )}
        {profileTime && <div className="text-xs text-muted-foreground mt-2">Updated {new Date(profileTime).toLocaleString("en-IN")}</div>}
      </Card>

      {/* Capture + extract */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <div className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Remember something</div>
          <textarea className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" rows={2}
            placeholder="e.g. We always give Reliance 45-day credit terms." value={cContent} onChange={(e) => setCContent(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <select className={I} value={cKind} onChange={(e) => setCKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
            <input className={I + " flex-1 min-w-[140px]"} placeholder="entities (comma-sep)" value={cEntities} onChange={(e) => setCEntities(e.target.value)} />
            <select className={I} value={cImportance} onChange={(e) => setCImportance(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>importance {n}</option>)}</select>
          </div>
          <Button size="sm" onClick={capture} disabled={busy === "capture"}>{busy === "capture" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Remember</Button>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="font-semibold flex items-center gap-2"><WandSparkles className="h-4 w-4 text-primary" /> Extract from text</div>
          <textarea className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" rows={2}
            placeholder="Paste a meeting note, email, or WhatsApp thread — Cortex pulls out what's worth remembering." value={extractText} onChange={(e) => setExtractText(e.target.value)} />
          <Button size="sm" onClick={extract} disabled={busy === "extract"}>{busy === "extract" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />} Extract & remember</Button>
          <p className="text-xs text-muted-foreground">Uses AI — costs a few credits.</p>
        </Card>
      </div>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {/* Filters + list */}
      <div className="flex flex-wrap gap-1.5">
        {["all", ...KINDS].map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`text-xs rounded-full border px-3 py-1 capitalize ${filter === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>{k}</button>
        ))}
      </div>
      <div className="space-y-2">
        {shown.length === 0 ? <Card className="p-6 text-center text-sm text-muted-foreground">No memories here yet.</Card> :
          shown.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] rounded px-1.5 py-0.5 capitalize ${kindColor[m.kind] || "bg-muted"}`}>{m.kind}</span>
                    {m.pinned && <Pin className="h-3 w-3 text-primary" />}
                    <span className="text-[11px] text-muted-foreground">importance {m.importance} · {m.source}</span>
                  </div>
                  {m.title && <div className="font-medium mt-1">{m.title}</div>}
                  <div className="text-sm mt-0.5">{m.content}</div>
                  {(m.entities?.length > 0 || m.tags?.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {m.entities.map((e) => <span key={e} className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground">{e}</span>)}
                      {m.tags.map((t) => <span key={t} className="text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground inline-flex items-center gap-0.5"><Tag className="h-2.5 w-2.5" />{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => pin(m)} title="Pin" className={`p-1 rounded hover:bg-accent ${m.pinned ? "text-primary" : "text-muted-foreground"}`}><Pin className="h-4 w-4" /></button>
                  <button onClick={() => archive(m)} title="Archive" className="p-1 rounded hover:bg-accent text-muted-foreground"><Archive className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ))}
      </div>

      {/* Entities + themes */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="font-semibold mb-2">Knowledge graph · {entities.length} entities</div>
          {entities.length === 0 ? <p className="text-sm text-muted-foreground">Entities appear as you capture memories that mention people, customers, vendors and products.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {entities.slice(0, 60).map((e) => (
                <span key={e.id} className="text-xs rounded-full border px-2.5 py-1">{e.name} <span className="text-muted-foreground">· {e.type} · {e.mention_count}</span></span>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Themes</div>
            <Button size="sm" variant="outline" onClick={runThemes} disabled={busy === "themes"}>{busy === "themes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Analyze</Button>
          </div>
          {themes.length === 0 ? <p className="text-sm text-muted-foreground">Cluster your memories into themes to see what your business keeps coming back to.</p> : (
            <div className="space-y-2">
              {themes.map((t, i) => (
                <div key={i} className="border-b last:border-0 pb-2 last:pb-0">
                  <div className="text-sm font-medium">{t.theme} <span className="text-xs text-muted-foreground">· ~{t.count}</span></div>
                  <div className="text-xs text-muted-foreground">{t.summary}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
