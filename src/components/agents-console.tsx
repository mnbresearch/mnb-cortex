"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, agentsForIndustry, type Agent } from "@/lib/agents/catalog";
import { Sparkles, Play, Download, Copy, Check, Loader2, RefreshCw, Lock, ChevronLeft, WandSparkles, Image as ImageIcon, Video } from "lucide-react";

const kindBadge: Record<string, { label: string; cls: string }> = {
  reasoning: { label: "Text", cls: "bg-primary/10 text-primary" },
  image: { label: "Image", cls: "bg-warning/10 text-warning" },
  video: { label: "Video", cls: "bg-danger/10 text-danger" },
};

async function api(url: string, opts?: RequestInit) { const r = await fetch(url, opts); return r.json().catch(() => ({})); }

export function AgentsConsole({ initialIndustry }: { initialIndustry: string }) {
  const [industry, setIndustry] = useState(initialIndustry || "jewellery");
  const [custom, setCustom] = useState<Agent[]>([]);
  const [sel, setSel] = useState<Agent | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [version, setVersion] = useState(0);
  const [revise, setRevise] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  // build-your-own
  const [biz, setBiz] = useState("");
  const [goals, setGoals] = useState("");
  const [buildMsg, setBuildMsg] = useState("");

  useEffect(() => { api("/api/agents").then((j) => setCustom(j.custom || [])); }, []);

  const agents = useMemo(() => industry === "custom" ? custom : agentsForIndustry(industry), [industry, custom]);

  function open(a: Agent) {
    setSel(a); setOutput(""); setVersion(0); setRevise(""); setMsg("");
    const seed: Record<string, string> = {}; a.inputs.forEach((i) => (seed[i.key] = ""));
    setInputs(seed);
  }

  async function run(reviseNote?: string) {
    if (!sel) return;
    setBusy("run"); setMsg("");
    const j = await api("/api/agents/run", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: sel.id, inputs, reviseNote, prior: reviseNote ? output : undefined, version }) });
    setBusy("");
    if (j.needsProvider) { setMsg(j.message); return; }
    if (!j.ok) { setMsg(j.error || "Run failed."); return; }
    setOutput(j.output); setVersion(j.version); setRevise("");
  }

  async function build() {
    if (!biz.trim()) return;
    setBusy("build"); setBuildMsg("");
    const j = await api("/api/agents/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business: biz, goals }) });
    setBusy("");
    if (j.ok) { const r = await api("/api/agents"); setCustom(r.custom || []); setBuildMsg(`Cortex built ${j.count} agents for you — see the Custom tab.`); setBiz(""); setGoals(""); }
    else setBuildMsg(j.error || "Could not build agents.");
  }

  function exportPdf() {
    if (!sel || !output) return;
    const html = `<html><head><title>${sel.name}</title><style>body{font-family:system-ui,Arial,sans-serif;color:#111;padding:40px;max-width:760px;margin:auto;line-height:1.6}h1{color:#1f4a3b;font-size:20px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px}</style></head><body><h1>${sel.name}</h1><div style="color:#666;font-size:12px;margin-bottom:16px">MNB Cortex · Agent output · ${new Date().toLocaleString("en-IN")}</div><pre>${output.replace(/</g, "&lt;")}</pre><script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
  }
  function exportMd() {
    if (!sel) return;
    const md = `# ${sel.name}\n\n${output}`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${sel.id.replace(/\./g, "-")}.md`; a.click();
  }
  function copy() { navigator.clipboard?.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  // ---- Detail view ----
  if (sel) {
    const badge = kindBadge[sel.kind];
    return (
      <div className="space-y-4">
        <button onClick={() => setSel(null)} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ChevronLeft className="h-4 w-4" /> All agents</button>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg">{sel.name}</h2>
            <span className={`text-[11px] rounded px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{sel.desc}</p>

          {sel.kind !== "reasoning" ? (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm flex items-start gap-2">
              <Lock className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <span>This {sel.kind === "video" ? "video" : "image"} agent needs a generation provider connected. The workflow — inputs, approve/revise, export — is fully built and runs the moment an {sel.kind === "video" ? "video" : "image"} model + budget is added.</span>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {sel.inputs.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-sm text-muted-foreground">{f.label}</span>
                  {f.type === "textarea" ? (
                    <textarea className="w-full mt-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" rows={3} placeholder={f.placeholder} value={inputs[f.key] || ""} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} />
                  ) : (
                    <input type={f.type === "number" ? "number" : "text"} className="w-full mt-1 rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={f.placeholder} value={inputs[f.key] || ""} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} />
                  )}
                </label>
              ))}
              <Button onClick={() => run()} disabled={busy === "run"}>{busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {output ? "Run again" : "Run agent"}</Button>
            </div>
          )}
          {msg && <p className="text-sm text-muted-foreground mt-3">{msg}</p>}
        </Card>

        {output && (
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Output <span className="text-xs text-muted-foreground">· v{version}</span></div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
                <Button size="sm" variant="outline" onClick={exportMd}><Download className="h-4 w-4" /> MD</Button>
                <Button size="sm" variant="outline" onClick={exportPdf}><Download className="h-4 w-4" /> PDF</Button>
              </div>
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed border rounded-lg p-4 bg-background max-h-[480px] overflow-y-auto">{output}</div>
            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-1">Not quite right? Revise it.</div>
              <div className="flex gap-2">
                <input className="flex-1 rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. make it shorter and more premium" value={revise} onChange={(e) => setRevise(e.target.value)} />
                <Button variant="outline" disabled={busy === "run" || !revise.trim()} onClick={() => run(revise)}><RefreshCw className="h-4 w-4" /> Revise</Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ---- Catalog view ----
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {INDUSTRIES.map((ind) => (
          <button key={ind.id} onClick={() => setIndustry(ind.id)} className={`text-sm rounded-full border px-3 py-1.5 ${industry === ind.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>
            <span className="mr-1">{ind.emoji}</span>{ind.name}
          </button>
        ))}
        <button onClick={() => setIndustry("custom")} className={`text-sm rounded-full border px-3 py-1.5 ${industry === "custom" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>
          <span className="mr-1">🛠️</span>Custom ({custom.length})
        </button>
      </div>

      {industry === "custom" && (
        <Card className="p-5 space-y-3 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 font-semibold"><WandSparkles className="h-4 w-4 text-primary" /> Let Cortex build agents for you</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Your business (e.g. artisan soap brand)" value={biz} onChange={(e) => setBiz(e.target.value)} />
            <input className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Goals (e.g. more online orders)" value={goals} onChange={(e) => setGoals(e.target.value)} />
          </div>
          <Button size="sm" onClick={build} disabled={busy === "build"}>{busy === "build" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Build my agents</Button>
          {buildMsg && <p className="text-sm text-muted-foreground">{buildMsg}</p>}
        </Card>
      )}

      {agents.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{industry === "custom" ? "No custom agents yet — build some above." : "No agents here yet."}</Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((a) => {
            const badge = kindBadge[a.kind];
            const Icon = a.kind === "video" ? Video : a.kind === "image" ? ImageIcon : Sparkles;
            return (
              <button key={a.id} onClick={() => open(a)} className="text-left rounded-xl border p-4 hover:border-primary/40 hover:bg-accent/40 transition-colors">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-primary" />
                  <span className={`text-[11px] rounded px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="font-medium mt-2">{a.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.desc}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
