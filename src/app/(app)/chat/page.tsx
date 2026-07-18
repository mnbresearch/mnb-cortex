"use client";
import { useState, useRef, useEffect } from "react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, User, Mic } from "lucide-react";
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
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const recogRef = useRef<any>(null);

  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice input isn't supported in this browser. Try Chrome."); return; }
    if (listening) { recogRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      setInput(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recogRef.current = rec; setListening(true); rec.start();
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Auto-send a question passed from the top-bar Ask bar (?q=...)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) { window.history.replaceState(null, "", "/chat"); send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const base = [...messages, { role: "user" as const, content: text }];
    setMessages([...base, { role: "assistant", content: "" }]);
    setInput(""); setLoading(true);
    try {
      const r = await fetch("/api/chat/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: base.map(({ role, content }) => ({ role, content })) }),
      });
      if (r.body) {
        const reader = r.body.getReader(); const dec = new TextDecoder(); let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { role: "assistant", content: acc }; return c; });
        }
      } else {
        const t = await r.text();
        setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { role: "assistant", content: t }; return c; });
      }
    } catch {
      setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { role: "assistant", content: "Network error reaching the AI COO." }; return c; });
    } finally { setLoading(false); }
  }

  const md = (s: string) => s
    .replace(/^## (.*)$/gm, "<b class='block mt-2'>$1</b>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/_(.*?)_/g, "<i>$1</i>");

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
                <p className="text-sm text-muted-foreground mt-1">I've already read your sales, finance, inventory, production and HR data.</p>
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
                {m.role === "assistant" && !m.content && loading ? (
                  <div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">Thinking through your numbers…</div>
                ) : (
                  <div className={`rounded-2xl px-4 py-3 text-sm max-w-[80%] whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-secondary" : "bg-card border"}`}
                    dangerouslySetInnerHTML={{ __html: md(m.content) }} />
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
        <div className="border-t glass px-4 lg:px-8 py-4">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="max-w-3xl mx-auto flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Listening…" : "Ask your AI COO…"}
              className="flex-1 rounded-xl border bg-card px-4 h-12 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <Button type="button" variant={listening ? "default" : "outline"} size="icon" className={`h-12 w-12 rounded-xl ${listening ? "animate-pulse" : ""}`} onClick={toggleMic} title="Voice input"><Mic className="h-4 w-4" /></Button>
            <Button size="icon" className="h-12 w-12 rounded-xl" disabled={loading}><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      </div>
    </>
  );
}
