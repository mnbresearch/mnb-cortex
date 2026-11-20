"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Quote, ShieldCheck, AlertTriangle, Workflow, MessageSquareText, Inbox, BadgeCheck, Mail, FileText, MessagesSquare, Zap } from "lucide-react";

/*
  THE PLATFORM, SHOWN WORKING — four scenes that play in turn.

  Each scene is a faithful picture of a screen that exists:
    Delegate  Agent Workspace (components/agent-workspace.tsx): a task, the lead
              agent's plan, specialists' steps, a result that waits on approval
    Ask       Company Knowledge answers with citations (lib/knowledge/core.ts)
    Approve   the Approvals queue and an Autopilot rule with limits (lib/engine)
    Verify    Veritas v1 (lib/veritas.ts): rupee figures grounded or flagged
              "unsupported"; percentages reported as not checked — never as
              verified, which is what the scene shows

  Names, amounts and dates are ILLUSTRATIVE and labelled so on the frame.

  Mechanics: a frame counter ticks while the showcase is on screen; each scene
  reveals one more element per tick and hands over to the next when done. A
  click on a tab takes control and stops the rotation. Reduced motion shows
  every scene fully drawn, no ticking.
*/

type SceneId = "delegate" | "ask" | "approve" | "verify";
const TABS: { id: SceneId; icon: any; label: string; title: string; d: string; frames: number }[] = [
  { id: "delegate", icon: Workflow, label: "Delegate", title: "Hand over the outcome, not the steps", d: "A lead agent plans the work, specialist agents carry it out in the background, and the result comes back ready to approve.", frames: 9 },
  { id: "ask", icon: MessageSquareText, label: "Ask", title: "Answers from your books and your company", d: "Cortex searches the ledger and the company's mail, chats and documents together — and names the source of every line.", frames: 6 },
  { id: "approve", icon: Inbox, label: "Approve", title: "Agents propose. You decide.", d: "Every reminder, update or export waits in Approvals. Autopilot rules you write, with limits, are the only exception.", frames: 7 },
  { id: "verify", icon: BadgeCheck, label: "Verify", title: "Every rupee checked by Veritas v1", d: "Each figure an agent states is traced back to the rows it read. Anything it cannot trace is flagged, not hidden.", frames: 7 },
];

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return { ref, inView };
}

export function PlatformShowcase() {
  const [tab, setTab] = useState(0);
  const [frame, setFrame] = useState(0);
  const [auto, setAuto] = useState(true);
  const [reduce, setReduce] = useState(false);
  const { ref, inView } = useInView<HTMLDivElement>();

  useEffect(() => { setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  useEffect(() => {
    if (reduce || !inView) return;
    const max = TABS[tab].frames + 4;              // hold the finished scene for a few ticks
    const t = setInterval(() => setFrame((f) => Math.min(f + 1, max)), 900);
    return () => clearInterval(t);
  }, [tab, inView, reduce]);

  useEffect(() => {
    if (auto && frame >= TABS[tab].frames + 4) { setTab((x) => (x + 1) % TABS.length); setFrame(0); }
  }, [frame, tab, auto]);

  const show = (n: number) => reduce || frame >= n;
  const T = TABS[tab];

  return (
    <div ref={ref} className="grid lg:grid-cols-[0.9fr_1.4fr] gap-8 lg:gap-12 items-start">
      <div role="tablist" aria-label="Platform" className="flex lg:flex-col gap-2 overflow-x-auto -mx-5 px-5 lg:mx-0 lg:px-0 pb-1">
        {TABS.map((x, i) => {
          const active = i === tab;
          return (
            <button
              key={x.id}
              role="tab"
              aria-selected={active}
              onClick={() => { setTab(i); setFrame(0); setAuto(false); }}
              className={`relative shrink-0 text-left rounded-2xl border px-4 py-3 lg:p-5 transition-colors ${active ? "bg-card border-primary/40" : "hover:bg-accent/50 border-transparent lg:border-border/60"}`}
            >
              <span className="flex items-center gap-2.5 font-medium">
                <x.icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
                {x.label}
                <span className="hidden lg:inline text-muted-foreground font-normal">— {x.title}</span>
              </span>
              {active && <p className="hidden lg:block mt-2 text-sm text-muted-foreground leading-6">{x.d}</p>}
              {active && !reduce && (
                <span className="absolute left-4 right-4 bottom-0 h-px bg-border overflow-hidden" aria-hidden>
                  <span key={`${tab}-${auto}`} className="block h-full bg-primary origin-left" style={{ transform: `scaleX(${Math.min(1, frame / (x.frames + 4))})`, transition: "transform .9s linear" }} />
                </span>
              )}
            </button>
          );
        })}
        <p className="lg:hidden shrink-0 self-center text-xs text-muted-foreground pl-2 max-w-[16rem]">{T.d}</p>
      </div>

      <div className="relative rounded-[22px] border bg-card glow-gold overflow-hidden min-h-[30rem]">
        <div className="flex items-center justify-between border-b px-5 h-11 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary cx-pulse" />{T.label === "Delegate" ? "Agent Workspace" : T.label === "Ask" ? "Ask Cortex" : T.label === "Approve" ? "Approvals" : "Veritas v1"}</span>
          <span className="rounded border px-1.5 py-0.5 tracking-wide">ILLUSTRATIVE</span>
        </div>
        <div key={tab} className="p-5 sm:p-6 text-sm">
          {T.id === "delegate" && <Delegate show={show} />}
          {T.id === "ask" && <Ask show={show} />}
          {T.id === "approve" && <Approve show={show} />}
          {T.id === "verify" && <Verify show={show} />}
        </div>
      </div>
    </div>
  );
}

function Step({ on, done, agent, what, out }: { on: boolean; done: boolean; agent: string; what: string; out: string }) {
  if (!on) return null;
  return (
    <li className="cx-rise flex gap-3 rounded-xl border bg-background/60 px-4 py-3">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? "bg-success/15 text-success" : "bg-primary/15 text-primary"}`}>
        {done ? <Check className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2"><span className="font-medium">{what}</span><span className="text-xs text-muted-foreground">{agent}</span></div>
        {done && <p className="cx-rise mt-0.5 text-xs text-muted-foreground">{out}</p>}
      </div>
    </li>
  );
}

function Delegate({ show }: { show: (n: number) => boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><p className="max-w-md rounded-2xl rounded-br-md bg-foreground text-background px-4 py-2.5">Prepare October&rsquo;s close pack and chase anything over 60 days.</p></div>
      {show(1) && <p className="cx-rise text-xs text-muted-foreground"><span className="text-foreground font-medium">CFO Agent</span> planned 4 steps · running in the background</p>}
      <ol className="space-y-2">
        <Step on={show(2)} done={show(3)} agent="Month-end Close Agent" what="Reconcile bank against invoices" out="212 matched · 3 to review" />
        <Step on={show(3)} done={show(4)} agent="Receivables Agent" what="Rank receivables over 60 days" out="6 customers · ₹18.4 lakh · 3 reminders drafted" />
        <Step on={show(4)} done={show(5)} agent="Compliance Agent" what="Check November filing dates" out="GSTR-3B due 20 Nov · TDS deposit due 7 Dec" />
        <Step on={show(5)} done={show(6)} agent="FP&A Agent" what="Draft the MIS commentary" out="Revenue up month on month; freight explains the margin dip" />
      </ol>
      {show(7) && (
        <div className="cx-rise rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> Close pack ready for your review</div>
          <p className="mt-1 text-xs text-muted-foreground">4 sources cited · every rupee figure checked by Veritas v1</p>
          {show(8) && (
            <div className="cx-rise mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-foreground text-background px-3.5 h-8 inline-flex items-center text-xs font-medium">Approve 3 reminders</span>
              <span className="rounded-full border px-3.5 h-8 inline-flex items-center text-xs font-medium">Open the pack</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Cite({ on, icon: Icon, children }: { on: boolean; icon: any; children: React.ReactNode }) {
  if (!on) return null;
  return <li className="cx-rise flex gap-2.5 rounded-lg border bg-background/60 px-3 py-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />{children}</li>;
}

function Ask({ show }: { show: (n: number) => boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><p className="max-w-md rounded-2xl rounded-br-md bg-foreground text-background px-4 py-2.5">Has Acme agreed to the new payment terms?</p></div>
      {show(1) && (
        <div className="cx-rise rounded-2xl border bg-background/60 p-4 leading-6">
          <p><span className="font-semibold">Yes, by email — but nothing is signed.</span> Acme&rsquo;s finance head agreed to 45-day terms from December invoices on 6 Nov. The contract addendum is still a draft, and their last two payments were 12 days late.</p>
        </div>
      )}
      {show(2) && <p className="cx-rise text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Quote className="h-3.5 w-3.5" /> Sources</p>}
      <ul className="space-y-2">
        <Cite on={show(2)} icon={Mail}>Outlook · Email · &ldquo;Re: Revised payment terms&rdquo; · from Acme&rsquo;s finance head · 6 Nov</Cite>
        <Cite on={show(3)} icon={FileText}>SharePoint · Document · &ldquo;Acme MSA Addendum v3 (draft).docx&rdquo;</Cite>
        <Cite on={show(4)} icon={MessagesSquare}>Teams · Chat · &ldquo;Acme renewal&rdquo; · sales and accounts</Cite>
        <Cite on={show(5)} icon={FileText}>Books · Receipts · Acme, last two payments</Cite>
      </ul>
    </div>
  );
}

function Proposal({ on, state, who, what }: { on: boolean; state: "waiting" | "approved" | "sent"; who: string; what: string }) {
  if (!on) return null;
  return (
    <li className="cx-rise flex items-center gap-3 rounded-xl border bg-background/60 px-4 py-3">
      <div className="min-w-0 flex-1"><div className="font-medium truncate">{what}</div><div className="text-xs text-muted-foreground">{who}</div></div>
      {state === "waiting" && <span className="shrink-0 rounded-full border px-3 h-7 inline-flex items-center text-xs">Waiting for you</span>}
      {state === "approved" && <span className="cx-rise shrink-0 rounded-full bg-foreground text-background px-3 h-7 inline-flex items-center text-xs font-medium">Approved</span>}
      {state === "sent" && <span className="cx-rise shrink-0 rounded-full bg-success/15 text-success px-3 h-7 inline-flex items-center gap-1 text-xs font-medium"><Check className="h-3 w-3" /> Sent</span>}
    </li>
  );
}

function Approve({ show }: { show: (n: number) => boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">3 actions proposed by your agents</p>
      <ul className="space-y-2">
        <Proposal on={show(1)} state={show(5) ? "sent" : show(4) ? "approved" : "waiting"} who="Receivables Agent · Northwind Traders · 74 days" what="Polite reminder for INV-2291" />
        <Proposal on={show(2)} state="waiting" who="Payables & MSME Agent · 43B(h)" what="Pay two MSME suppliers before day 45" />
        <Proposal on={show(3)} state="waiting" who="Board Pack Agent" what="Export October MIS to the board folder" />
      </ul>
      {show(6) && (
        <div className="cx-rise rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 font-medium"><Zap className="h-4 w-4 text-primary" /> Autopilot rule</div>
          <p className="mt-1 text-xs text-muted-foreground leading-5">Send reminders to regular customers for invoices under ₹50,000 without asking — at most 10 a day. Everything else still waits for you.</p>
        </div>
      )}
    </div>
  );
}

function Fig({ on, ok, children, note }: { on: boolean; ok: "yes" | "no" | "skip"; children: React.ReactNode; note: string }) {
  const cls = !on ? "" : ok === "yes" ? "bg-success/15 text-success" : ok === "no" ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground";
  return (
    <span className="relative inline-block">
      <span className={`rounded px-1 transition-colors ${cls}`}>{children}</span>
      {on && <span className="sr-only"> ({note})</span>}
    </span>
  );
}

function Verify({ show }: { show: (n: number) => boolean }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-background/60 p-4 leading-7">
        Overdue receivables stand at <Fig on={show(1)} ok="yes" note="supported">₹18.4 lakh</Fig> across six customers. Northwind owes{" "}
        <Fig on={show(2)} ok="yes" note="supported">₹4.2 lakh</Fig>, 74 days past due. Collections improved{" "}
        <Fig on={show(3)} ok="skip" note="not checked">9%</Fig> on September, and a further{" "}
        <Fig on={show(4)} ok="no" note="unsupported">₹6.5 lakh</Fig> is expected this week.
      </div>
      <ul className="space-y-2 text-xs">
        {show(1) && <li className="cx-rise flex gap-2.5 rounded-lg border bg-background/60 px-3 py-2"><Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" /><span><span className="font-medium">₹18.4 lakh — supported.</span> <span className="text-muted-foreground">Rounds from ₹18,41,250, the receivables rows the agent read.</span></span></li>}
        {show(2) && <li className="cx-rise flex gap-2.5 rounded-lg border bg-background/60 px-3 py-2"><Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" /><span><span className="font-medium">₹4.2 lakh — supported.</span> <span className="text-muted-foreground">Northwind&rsquo;s open invoices total ₹4,19,850.</span></span></li>}
        {show(3) && <li className="cx-rise flex gap-2.5 rounded-lg border bg-background/60 px-3 py-2"><span className="h-3.5 w-3.5 shrink-0 mt-0.5 grid place-items-center text-muted-foreground">–</span><span><span className="font-medium">9% — not checked.</span> <span className="text-muted-foreground">Percentages are derived; v1 says so instead of calling them verified.</span></span></li>}
        {show(4) && <li className="cx-rise flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2"><AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" /><span><span className="font-medium">₹6.5 lakh — unsupported.</span> <span className="text-muted-foreground">No row the agents read contains it. Flagged on the answer for you to check.</span></span></li>}
      </ul>
      {show(5) && <p className="cx-rise text-xs text-muted-foreground flex items-center gap-1.5"><BadgeCheck className="h-3.5 w-3.5 text-primary" /> Veritas v1 · 3 rupee figures checked · 2 supported · 1 unsupported · 1 not checked</p>}
    </div>
  );
}
