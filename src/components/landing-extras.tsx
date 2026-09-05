"use client";
/*
  prefers-reduced-motion, which this file ignored entirely.

  motion.tsx and loco.tsx both honour it; these three did not. RotatingWord is
  the serious one — a setInterval that runs forever with no way to pause it,
  in the landing hero. That is WCAG 2.2.2 (moving content over five seconds
  must be pausable) as well as 2.3.3, and for someone with a vestibular
  disorder it is the difference between reading the page and leaving it.
*/
const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

import { useEffect, useRef, useState } from "react";

/** Fades + slides children in when they scroll into view (with a safe fallback). */
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  /* Reduced motion: render shown immediately, no transform, no transition. */
  const [shown, setShown] = useState(() => prefersReduced());
  useEffect(() => {
    if (prefersReduced()) { setShown(true); return; }
    const el = ref.current;
    const fallback = setTimeout(() => setShown(true), 600); // never leave content hidden
    if (!el || typeof IntersectionObserver === "undefined") return () => clearTimeout(fallback);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } });
    }, { threshold: 0.12 });
    io.observe(el);
    return () => { clearTimeout(fallback); io.disconnect(); };
  }, []);
  return (
    <div ref={ref} className={className} style={{
      transition: "opacity .6s ease, transform .6s cubic-bezier(.2,.7,.3,1)",
      transitionDelay: `${delay}ms`,
      opacity: shown ? 1 : 0,
      transform: shown ? "none" : "translateY(20px)",
    }}>
      {children}
    </div>
  );
}

/** Counts up to a number when it scrolls into view. */
export function CountUp({ to, suffix = "", prefix = "", duration = 1200 }: { to: number; suffix?: string; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    /* Reduced motion: show the final number rather than animating to it. The
       information is the number, not the count. */
    if (prefersReduced()) { setVal(to); return; }
    const el = ref.current; if (!el) return;
    const start = () => {
      if (started.current) return; started.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(eased * to));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (typeof IntersectionObserver === "undefined") { start(); return; }
    const io = new IntersectionObserver((e) => e.forEach((x) => x.isIntersecting && start()), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{prefix}{val.toLocaleString("en-IN")}{suffix}</span>;
}

/** Cycles a word in the headline. */
export function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);
  useEffect(() => {
    /*
      Reduced motion: stop rotating entirely and hold the first word.

      This is the one that mattered most in this file — an interval with no
      pause control, running forever, in the landing hero. WCAG 2.2.2 requires
      moving content lasting more than five seconds to be pausable; honouring
      the OS preference is the pause.
    */
    if (prefersReduced()) return;
    const t = setInterval(() => {
      setShow(false);
      setTimeout(() => { setI((v) => (v + 1) % words.length); setShow(true); }, 300);
    }, 2600);
    return () => clearInterval(t);
  }, [words.length]);
  return (
    <span className="gradient-text inline-block" style={{ transition: "opacity .3s, transform .3s", opacity: show ? 1 : 0, transform: show ? "none" : "translateY(6px)" }}>
      {words[i]}
    </span>
  );
}
