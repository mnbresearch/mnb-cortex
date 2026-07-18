"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Copy, Check, MessageCircle } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

export function BroadcastComposer() {
  const [brief, setBrief] = useState("");
  const [out, setOut] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!brief.trim()) return;
    setLoading(true); setOut(""); setMsg("");
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "broadcast", input: brief }) });
      const j = await r.json();
      setOut(j.text || "No response.");
      // Extract the primary message (first non-heading, non-empty line block after "Primary message")
      const t: string = j.text || "";
      const after = t.split(/##+\s*Primary message[^\n]*\n/i)[1] || t;
      const firstBlock = after.split(/\n##+/)[0].replace(/\*\*/g, "").trim();
      setMsg(firstBlock.slice(0, 600));
    } catch { setOut("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  function copy() { navigator.clipboard?.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  const waHref = `https://wa.me/?text=${encodeURIComponent(msg)}`;

  return (
    <Card className="p-5 space-y-4">
      <div><div className="font-semibold flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" /> Broadcast composer</div><div className="text-sm text-muted-foreground">Describe the campaign — get a ready-to-send WhatsApp broadcast.</div></div>
      <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} placeholder="e.g. Festive 10% off on Premium-X for distributors who haven't ordered in 30 days"
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
      <Button onClick={generate} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Writing…" : "Generate broadcast"}</Button>

      {msg && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Message to send (editable)</div>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</Button>
            <a href={waHref} target="_blank" rel="noopener noreferrer"><Button size="sm"><MessageCircle className="h-4 w-4" /> Open in WhatsApp</Button></a>
          </div>
        </div>
      )}
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}
