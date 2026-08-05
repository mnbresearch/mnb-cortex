"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit, Landmark, MessageSquare, Megaphone, Radar, Rocket, ArrowRight, ArrowLeft, X } from "lucide-react";

const KEY = "cortex_tour_v1";

const STEPS = [
  { icon: BrainCircuit, title: "Meet your operating brain", body: "MNB Cortex reads your business, remembers every decision, and acts. Not a chatbot — an AI that runs the loop across your whole company.", href: "", cta: "" },
  { icon: Landmark, title: "Give it your real numbers", body: "Upload a bank statement or GST return, or import a CSV. In seconds Cortex turns it into your real cash truth — and grounds every answer in it.", href: "/bank", cta: "Upload a statement" },
  { icon: MessageSquare, title: "Ask it anything", body: "Ask “How is my business?” in plain language. For the deep stuff, run a Cortex Deep Dive — it diagnoses, decides, and drafts the first action.", href: "/deepdive", cta: "Try a Deep Dive" },
  { icon: Megaphone, title: "Let it act for you", body: "AI Outreach drafts payment reminders, follow-ups and supplier notes. You review and approve — it sends by email or WhatsApp.", href: "/act", cta: "Open AI Outreach" },
  { icon: Radar, title: "Get found by AI", body: "Buyers ask ChatGPT & Gemini for recommendations. AI Visibility checks whether they name you — and drafts the fix.", href: "/visibility", cta: "Check my visibility" },
  { icon: Rocket, title: "You're all set", body: "Everything lives in the sidebar. The fastest start: add your data, then ask Cortex how your business is doing.", href: "/bank", cta: "Add my first data" },
];

export function OnboardingTour({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [anim, setAnim] = useState(0); // bump to retrigger step animation

  useEffect(() => {
    const wantsManual = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tour") === "1";
    let show = false;
    try { show = signedIn && !localStorage.getItem(KEY); } catch {}
    if (wantsManual) show = true;
    if (show) { const t = setTimeout(() => setOpen(true), 500); return () => clearTimeout(t); }
    const onStart = () => { setStep(0); setOpen(true); };
    window.addEventListener("cortex:start-tour", onStart);
    return () => window.removeEventListener("cortex:start-tour", onStart);
  }, [signedIn]);

  function done() {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setOpen(false);
  }
  function go(dir: number) {
    const next = Math.min(STEPS.length - 1, Math.max(0, step + dir));
    if (next === step) { if (dir > 0) done(); return; }
    setStep(next); setAnim((a) => a + 1);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, step]);

  if (!open) return null;
  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <style>{`@keyframes tourIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}@keyframes tourFade{from{opacity:0}to{opacity:1}}`}</style>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" style={{ animation: "tourFade .25s ease" }} onClick={done} />
      <div key={anim} className="relative w-full max-w-md rounded-2xl border bg-card p-7 shadow-2xl" style={{ animation: "tourIn .4s cubic-bezier(.19,1,.22,1)" }}>
        <button onClick={done} className="absolute top-4 right-4 h-8 w-8 grid place-items-center rounded-full hover:bg-accent text-muted-foreground" aria-label="Skip tour"><X className="h-4 w-4" /></button>

        <div className="h-14 w-14 rounded-2xl brand-gradient grid place-items-center text-white"><Icon className="h-7 w-7" /></div>
        <div className="mt-5 text-xs font-medium text-primary">Step {step + 1} of {STEPS.length}</div>
        <h2 className="mt-1 font-display text-2xl tracking-tightest">{s.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-6">{s.body}</p>

        {s.href && (
          <Link href={s.href} onClick={done} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            {s.cta} <ArrowRight className="h-4 w-4" />
          </Link>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => go(-1)} className="h-9 w-9 grid place-items-center rounded-lg border hover:bg-accent" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
            )}
            <button onClick={() => go(1)} className="inline-flex items-center gap-1.5 rounded-lg brand-gradient text-white px-4 h-9 text-sm font-medium">
              {last ? "Finish" : "Next"} {!last && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {!last && <button onClick={done} className="mt-3 text-xs text-muted-foreground hover:text-foreground">Skip tour</button>}
      </div>
    </div>
  );
}
