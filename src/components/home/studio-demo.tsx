"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, ShieldCheck, Eye, Inbox, Ban, BadgeCheck, Check, Users } from "lucide-react";

/*
  Agent Studio, shown working (homepage). A faithful picture of the screen in
  components/agent-studio.tsx: a plain-words description, the drafted agent,
  its permission card (computed there from the ticked tools by
  lib/agents/studio.ts permissionCard), and the agent joining its team.
  Labelled illustrative; plays only on screen; reduced motion shows it drawn.
*/
const DESC = "Every Monday, find distributors in Gujarat more than 60 days overdue and draft a polite reminder for each.";
const FRAMES = 9;

export function StudioDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [typed, setTyped] = useState(0);
  const [inView, setInView] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const el = ref.current; if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el); return () => io.disconnect();
  }, []);

  /* Type the description, then reveal one element per tick, hold, and loop. */
  useEffect(() => {
    if (reduce || !inView) return;
    if (typed < DESC.length) { const t = setTimeout(() => setTyped((n) => Math.min(DESC.length, n + 3)), 28); return () => clearTimeout(t); }
    const t = setTimeout(() => {
      if (frame < FRAMES + 4) setFrame((f) => f + 1);
      else { setFrame(0); setTyped(0); }
    }, 750);
    return () => clearTimeout(t);
  }, [typed, frame, inView, reduce]);

  const show = (n: number) => reduce || (typed >= DESC.length && frame >= n);
  const text = reduce ? DESC : DESC.slice(0, typed);

  return (
    <div ref={ref} className="relative rounded-[22px] border bg-card glow-gold overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 h-11 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> Agent Studio</span>
        <span className="rounded border px-1.5 py-0.5 tracking-wide">ILLUSTRATIVE</span>
      </div>
      <div className="p-5 sm:p-6 space-y-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Describe the job</p>
          <p className="mt-2 rounded-xl border bg-background/60 px-4 py-3 min-h-[4.5rem] leading-6">{text}{!reduce && typed < DESC.length && <span className="inline-block w-[2px] h-4 bg-primary align-middle ml-0.5 cx-pulse" />}</p>
        </div>

        {show(1) && (
          <div className="cx-rise grid sm:grid-cols-[1fr_1.05fr] gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Drafted agent</p>
              <div className="rounded-xl border bg-background/60 p-4 space-y-2">
                <p className="font-semibold">Gujarat Collections Agent</p>
                <p className="text-xs text-muted-foreground">Joins the Finance team · runs every Monday</p>
                {show(2) && <div className="cx-rise flex flex-wrap gap-1.5 pt-1">
                  {["Receivables", "Find a customer", "Search mail", "Propose an action"].map((t, i) => (
                    <span key={t} className={`rounded-md border px-2 py-0.5 text-[11px] ${i === 3 ? "border-primary/40 text-primary" : ""}`}>{t}</span>
                  ))}
                </div>}
              </div>
              {show(7) && (
                <div className="cx-rise rounded-xl border border-success/30 bg-success/10 px-4 py-3 flex items-center gap-2 text-xs">
                  <Users className="h-4 w-4 text-success" /> Joined the Finance team — the CFO Agent can now plan it in.
                </div>
              )}
            </div>
            <div className="rounded-xl border bg-background/60 p-4 space-y-2.5 text-xs">
              <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Permission card</p>
              {show(3) && <div className="cx-rise"><p className="flex items-center gap-1.5 font-medium"><Eye className="h-3.5 w-3.5 text-muted-foreground" /> May read</p><p className="text-muted-foreground mt-0.5">Who owes you · one customer at a time · connected mail</p></div>}
              {show(4) && <div className="cx-rise"><p className="flex items-center gap-1.5 font-medium"><Inbox className="h-3.5 w-3.5 text-muted-foreground" /> May propose</p><p className="text-muted-foreground mt-0.5">Reminders — each waits for your approval</p></div>}
              {show(5) && <div className="cx-rise"><p className="flex items-center gap-1.5 font-medium"><Ban className="h-3.5 w-3.5 text-muted-foreground" /> Can never</p><p className="text-muted-foreground mt-0.5">Send, pay or delete on its own · use a tool you did not give it</p></div>}
              {show(6) && <div className="cx-rise"><p className="flex items-center gap-1.5 font-medium"><BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" /> Always</p><p className="text-muted-foreground mt-0.5">Metered to a credit ceiling · rupees checked by Veritas v1 · sources cited</p></div>}
            </div>
          </div>
        )}
        {show(8) && <p className="cx-rise text-xs text-muted-foreground flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> Saved by an admin. Nothing ran until it was approved.</p>}
      </div>
    </div>
  );
}
