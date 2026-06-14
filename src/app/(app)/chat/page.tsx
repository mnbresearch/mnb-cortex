"use client";
import { useState, useRef, useEffect } from "react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, User } from "lucide-react";
import type { ChatMessage } from "@/types";

const SUGGESTIONS = [
  "How is my business?",
  "Why is profit falling?",
  "What should I focus on this week?",
  "What inventory should I buy?",
  "Should I raise prices?",
  "Should I enter the Dubai market?",
];

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setInput(""); setLoading(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const j = await r.json();
      setMessages([...next, { role: "assistant", content: j.reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Network error reaching the AI COO." }]);
    } finally { setLoading(false); }
  }

  return (
    <>
      <Topbar title="AI CEO Chat" subtitle="Ask your business anything." />
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <div className="h-14 w-14 rounded-2xl bg-primary/15 grid place-items-center mx-auto"><Sparkles className="h-7 w-7 text-primary" /></div>
                <h2 className="mt-4 text-xl font-semibold">Good morning. What do you want to know?</h2>
                <p className="text-sm text-muted-foreground mt-1">I’ve already read your sales, finance, inventory, production and HR data.</p>
                <div className="mt-6 grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-left text-sm rounded-lg border px-4 py-3 hover:bg-accent transition-colors">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${m.role === "user" ? "bg-secondary" : "bg-primary text-primary-foreground"}`}>
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div className={`rounded-2xl px-4 py-3 text-sm max-w-[80%] whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-secondary" : "bg-card border"}`}
                  dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>").replace(/_(.*?)_/g, "<i>$1</i>") }} />
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center"><Sparkles className="h-4 w-4 animate-pulse" /></div>
                <div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">Thinking through your numbers…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t glass px-4 lg:px-8 py-4">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="max-w-3xl mx-auto flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your AI COO…"
              className="flex-1 rounded-xl border bg-card px-4 h-12 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <Button size="icon" className="h-12 w-12 rounded-xl" disabled={loading}><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      </div>
    </>
  );
}
