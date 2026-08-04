"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowUp } from "lucide-react";

const SCRIPT = [
  { q: "How is my business today?", a: "Revenue is up 18% MTD and cash runway is healthy at 7.4 months. One watch-out: receivables aged 45+ days rose 22%. Want me to draft reminders?" },
  { q: "Which customers might churn?", a: "Three accounts show falling order frequency and slower payments — Sharma Textiles, NovaMart and RK Traders. I've prepared a win-back offer for each." },
  { q: "Can we afford to hire 2 salespeople?", a: "Yes. At current margins, two hires pay back in ~4.6 months if each closes ₹3.5L/mo. I modelled best and worst cases with the cash impact." },
  { q: "Draft this month's investor update.", a: "Done — 18% MoM growth, ₹42.8L revenue, an 82 Cortex Score, key wins and two risks. Review and I'll send it." },
];

export function AskCortexDemo() {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    const sleep = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));
    const type = async (text: string, set: (s: string) => void, speed: number) => {
      if (reduce) { set(text); return; }
      for (let k = 1; k <= text.length; k++) { if (!alive) return; set(text.slice(0, k)); await sleep(speed); }
    };
    (async () => {
      let idx = 0;
      // small initial delay so it doesn't animate before paint
      await sleep(500);
      while (alive) {
        const item = SCRIPT[idx % SCRIPT.length];
        setQ(""); setA(""); setThinking(false);
        await type(item.q, setQ, 32);
        if (!alive) return;
        setThinking(true); await sleep(750); setThinking(false);
        await type(item.a, setA, 15);
        await sleep(2800);
        idx++;
      }
    })();
    return () => { alive = false; timers.forEach((t) => clearTimeout(t)); };
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" }); }, [a, thinking]);

  return (
    <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden flex flex-col h-full min-h-[380px] glow-ring">
      <div className="flex items-center gap-2 px-4 h-11 border-b bg-secondary/40">
        <div className="h-6 w-6 rounded-lg brand-gradient grid place-items-center"><Sparkles className="h-3.5 w-3.5 text-white" /></div>
        <span className="text-sm font-medium">Ask Cortex</span>
        <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> live</span>
      </div>

      <div ref={scrollRef} className="flex-1 p-4 space-y-3 overflow-hidden">
        {q && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground text-background px-3.5 py-2 text-sm">{q}<span className="opacity-0">.</span></div>
          </div>
        )}
        {thinking && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm pl-1">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        )}
        {a && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-primary/8 border border-primary/15 px-3.5 py-2 text-sm text-foreground/90">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary mb-1"><Sparkles className="h-3 w-3" /> Cortex</span>
              <p>{a}</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t">
        <div className="flex items-center gap-2 rounded-full border bg-background px-4 h-11 text-sm text-muted-foreground">
          Ask anything about your business…
          <span className="ml-auto h-7 w-7 rounded-full btn-ink grid place-items-center"><ArrowUp className="h-4 w-4" /></span>
        </div>
      </div>
    </div>
  );
}
