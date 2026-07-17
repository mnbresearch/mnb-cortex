"use client";
import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, User } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
export function Copilot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const base = [...messages, { role: "user" as const, content: text }];
    setMessages([...base, { role: "assistant", content: "" }]); setInput(""); setLoading(true);
    try {
      const r = await fetch("/api/chat/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: base }) });
      if (r.body) { const rd = r.body.getReader(); const dec = new TextDecoder(); let acc = "";
        while (true) { const { done, value } = await rd.read(); if (done) break; acc += dec.decode(value, { stream: true });
          setMessages((p) => { const c = [...p]; c[c.length - 1] = { role: "assistant", content: acc }; return c; }); }
      } else { const t = await r.text(); setMessages((p) => { const c = [...p]; c[c.length - 1] = { role: "assistant", content: t }; return c; }); }
    } catch { setMessages((p) => { const c = [...p]; c[c.length - 1] = { role: "assistant", content: "Network error." }; return c; }); }
    finally { setLoading(false); }
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} title="AI Copilot" className="fixed bottom-24 lg:bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg grid place-items-center hover:scale-105 transition-transform no-print">
          <Sparkles className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-[80] w-[92vw] max-w-sm h-[70vh] max-h-[560px] rounded-2xl border bg-card shadow-2xl flex flex-col overflow-hidden no-print">
          <div className="flex items-center justify-between px-4 h-12 border-b bg-primary/5">
            <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> AI Copilot</div>
            <button onClick={() => setOpen(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <Sparkles className="h-6 w-6 text-primary mx-auto mb-2" />Ask me anything about your business — I'm on every page.
                <div className="mt-3 grid gap-1.5">
                  {["How is my business?", "What should I do today?", "Any risks right now?"].map((q) => <button key={q} onClick={() => send(q)} className="text-left text-xs rounded-lg border px-3 py-2 hover:bg-accent">{q}</button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`h-7 w-7 rounded-lg grid place-items-center shrink-0 ${m.role === "user" ? "bg-secondary" : "bg-primary text-primary-foreground"}`}>{m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}</div>
                {m.role === "assistant" && !m.content && loading ? <div className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">Thinking…</div> :
                  <div className={`rounded-xl px-3 py-2 text-xs max-w-[80%] whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-secondary" : "bg-background border"}`} dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} />}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t p-2 flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your COO…" className="flex-1 rounded-lg border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center" disabled={loading}><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
    </>
  );
}
