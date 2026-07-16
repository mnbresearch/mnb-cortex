"use client";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload } from "lucide-react";
import { mdToHtml } from "@/lib/utils";
import { saveArtifact } from "@/lib/actions";
import { Save } from "lucide-react";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return reject();
    if ([...document.scripts].some((sc) => sc.src === src)) return resolve();
    const el = document.createElement("script");
    el.src = src; el.onload = () => resolve(); el.onerror = () => reject();
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
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    out += tc.items.map((x: any) => x.str).join(" ") + "\n";
    if (out.length > 20000) break;
  }
  return out;
}

export function AIPanel({ mode, placeholder, cta, multiline = false, allowFile = false, saveMode }: {
  mode: string; placeholder: string; cta: string; multiline?: boolean; allowFile?: boolean; saveMode?: string;
}) {
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run() {
    if (mode !== "pulse" && !input.trim()) return;
    setLoading(true); setOut("");
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, input }) });
      const j = await r.json();
      setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setLoading(true);
    try {
      let text = "";
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) text = await extractPdf(f);
      else text = await f.text();
      setInput(text.slice(0, 20000));
    } catch { alert("Couldn't read that file automatically — please paste the text instead."); }
    finally { setLoading(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      {allowFile && (
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.pdf,text/*,application/pdf" className="hidden" onChange={onFile} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload PDF / text</Button>
          <span className="text-xs text-muted-foreground">PDF text is auto-extracted, or paste below</span>
        </div>
      )}
      {multiline ? (
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} rows={5}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
      ) : (
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          className="w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
      )}
      <Button onClick={run} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Working…" : cta}</Button>
      {loading && <p className="text-sm text-muted-foreground">The AI COO is analysing…</p>}
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
      {out && saveMode && (
        <form action={saveArtifact} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="mode" value={saveMode} />
          <input type="hidden" name="content" value={out} />
          <input name="title" placeholder="Title to save as…" defaultValue={input.slice(0, 60)} className="rounded-lg border bg-background px-3 h-9 text-sm flex-1 min-w-[200px] outline-none focus:ring-2 focus:ring-ring" />
          <Button type="submit" variant="outline"><Save className="h-4 w-4" /> Save to workspace</Button>
        </form>
      )}
    </Card>
  );
}

export function AIPulse() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try { const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "pulse" }) }); const j = await r.json(); setText(j.text || ""); }
    catch { setText("Could not refresh."); } finally { setLoading(false); }
  }
  return (
    <div className="mt-2">
      <button onClick={run} disabled={loading} className="text-sm text-primary font-medium inline-flex items-center gap-1">
        <Sparkles className="h-3.5 w-3.5" /> {loading ? "Analysing…" : "Refresh AI pulse"}
      </button>
      {text && <p className="mt-2 text-sm">{text}</p>}
    </div>
  );
}
