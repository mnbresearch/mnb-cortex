"use client";
import { useEffect, useRef } from "react";

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;

/** Buttery smooth scroll (Lenis via CDN) — progressive enhancement, off for reduced-motion/touch. */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReduced() || isTouch()) return;
    let lenis: any; let raf = 0;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/lenis@1.1.14/dist/lenis.min.js";
    s.async = true;
    s.onload = () => {
      const L = (window as any).Lenis;
      if (!L) return;
      lenis = new L({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
      const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      // keep anchor links working
      document.querySelectorAll('a[href^="#"]').forEach((a) => {
        a.addEventListener("click", (e) => {
          const id = (a as HTMLAnchorElement).getAttribute("href") || "";
          if (id.length > 1) { const el = document.querySelector(id); if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -80 }); } }
        });
      });
    };
    document.body.appendChild(s);
    return () => { cancelAnimationFrame(raf); try { lenis?.destroy(); } catch {} s.remove(); };
  }, []);
  return null;
}

/** Trailing ring cursor that grows over interactive elements. Native cursor stays visible. */
export function Cursor() {
  useEffect(() => {
    if (prefersReduced() || isTouch()) return;
    const dot = document.createElement("div");
    dot.className = "loco-cursor";
    document.body.appendChild(dot);
    let x = 0, y = 0, cx = 0, cy = 0, raf = 0;
    const move = (e: MouseEvent) => { x = e.clientX; y = e.clientY; dot.classList.add("on"); };
    const leave = () => dot.classList.remove("on");
    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("a,button,[data-cursor]")) dot.classList.add("big");
      else dot.classList.remove("big");
    };
    const loop = () => {
      cx += (x - cx) * 0.18; cy += (y - cy) * 0.18;
      dot.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseover", over);
    document.addEventListener("mouseleave", leave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseover", over);
      document.removeEventListener("mouseleave", leave);
      dot.remove();
    };
  }, []);
  return null;
}

/** Headline whose words rise into place, staggered, when scrolled into view. Multi-line via "\n". */
export function Kinetic({
  text, as = "span", className = "", stagger = 55,
}: { text: string; as?: any; className?: string; stagger?: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("kin-armed");
    const words = Array.from(el.querySelectorAll<HTMLElement>(".kin"));
    const run = () => words.forEach((w, i) => { w.style.transitionDelay = `${i * stagger}ms`; w.classList.add("in"); });
    const fb = setTimeout(run, 1100);
    if (typeof IntersectionObserver === "undefined") { run(); return () => clearTimeout(fb); }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { run(); io.disconnect(); } });
    }, { threshold: 0.2 });
    io.observe(el);
    return () => { clearTimeout(fb); io.disconnect(); };
  }, [stagger, text]);
  const Tag: any = as;
  const lines = text.split("\n");
  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, li) => (
        <span key={li} style={{ display: "block" }}>
          {line.split(" ").map((w, wi) => (
            <span key={wi} className="kin"><span>{w}&nbsp;</span></span>
          ))}
        </span>
      ))}
    </Tag>
  );
}

/** Small numbered section label: "(01) — Capabilities" */
export function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 eyebrow">
      <span>({n})</span>
      <span className="h-px w-8 bg-current opacity-40" />
      <span>{children}</span>
    </div>
  );
}

/** Infinite horizontal marquee of string items. */
export function Marquee({ items, reverse = false, className = "" }: { items: string[]; reverse?: boolean; className?: string }) {
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden">
      <div className={`flex w-max ${reverse ? "marquee-rev" : "marquee"} ${className}`}>
        {row.map((it, i) => (
          <span key={i} className="flex items-center whitespace-nowrap">
            <span>{it}</span>
            <span className="mx-6 opacity-40">/</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Subtle magnetic pull on hover for buttons/links. */
export function Magnetic({ children, className = "", strength = 0.3 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced() || isTouch()) return;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const mx = e.clientX - (r.left + r.width / 2);
      const my = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${mx * strength}px, ${my * strength}px)`;
    };
    const reset = () => { el.style.transform = "translate(0,0)"; };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", reset);
    return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", reset); };
  }, [strength]);
  return (
    <span ref={ref} className={`inline-block will-change-transform ${className}`} style={{ transition: "transform .35s cubic-bezier(.19,1,.22,1)" }}>
      {children}
    </span>
  );
}
