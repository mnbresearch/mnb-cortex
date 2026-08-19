"use client";

/**
 * The shared motion system.
 *
 * framer-motion was already a dependency but was used in exactly one component
 * out of 131, so the app animated almost nothing. These are the primitives every
 * surface should reach for, so motion stays consistent instead of each screen
 * inventing its own easing and duration.
 *
 * Three rules the whole system follows:
 *
 * 1. ONE easing curve. [0.22, 1, 0.36, 1] is a fast-out, slow-in curve — it
 *    starts quickly so the interface feels responsive, then settles gently so it
 *    doesn't feel abrupt. Mixing curves is what makes an interface feel
 *    assembled by different people.
 * 2. SHORT durations. 180-420ms. Anything slower reads as sluggish once you use
 *    the product every day rather than seeing it once in a demo.
 * 3. Motion is never load-bearing. Every animation starts from a state where the
 *    content is already laid out, so a failure to animate degrades to plain
 *    content rather than an empty screen.
 *
 * Reduced motion is honoured everywhere via useReducedMotion(): transforms
 * collapse to a plain fade, or to nothing at all.
 */

import {
  motion,
  useReducedMotion,
  useInView,
  useSpring,
  useMotionValue,
  useTransform,
  AnimatePresence,
  type Variants,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** The one easing curve. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const DURATION = { fast: 0.18, base: 0.28, slow: 0.42 } as const;

/* ------------------------------------------------------------------ Reveal */

/**
 * Fade and rise into place when scrolled into view.
 * `once` so a long page doesn't re-animate as the user scrolls back up, which
 * is distracting rather than delightful.
 */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });
  const M = motion[as] as typeof motion.div;

  return (
    <M
      ref={ref as any}
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: DURATION.slow, ease: EASE, delay }}
    >
      {children}
    </M>
  );
}

/* ----------------------------------------------------------------- Stagger */

/**
 * Parent for a list whose children should arrive one after another.
 * Pair with <StaggerItem>. The 40ms step is deliberately small: a grid of
 * twelve cards finishes in under half a second rather than making the user
 * watch a slideshow.
 */
export function Stagger({
  children,
  className,
  step = 0.04,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const variants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : step, delayChildren: delay } },
  };
  return (
    <motion.div className={className} variants={variants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, y = 12 }: { children: ReactNode; className?: string; y?: number }) {
  const reduced = useReducedMotion();
  const variants: Variants = {
    hidden: reduced ? { opacity: 0 } : { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } },
  };
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------ Number ticker */

/**
 * Count a number up when it first appears.
 *
 * Used for money and KPIs. It draws the eye to the figure that changed, which
 * on a dashboard is the entire point of the screen. Formatting is delegated so
 * ₹ grouping stays identical to the static rendering — an animated number that
 * formats differently from the rest of the app looks like a bug.
 */
export function Ticker({
  value,
  format = (n: number) => String(Math.round(n)),
  className,
  duration = 0.9,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(() => (reduced ? value : 0));

  useEffect(() => {
    if (reduced || !inView) { setDisplay(value); return; }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // easeOutExpo — fast start, long settle. Reads as "landing" on a figure.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, inView, reduced, duration]);

  return <span ref={ref} className={className}>{format(display)}</span>;
}

/* -------------------------------------------------------------- Press / hover */

/** A button or card that responds to being pressed. Subtle, not bouncy. */
export function Pressable({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      onClick={onClick}
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.985 }}
      transition={{ duration: DURATION.fast, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------ Spotlight card */

/**
 * A card with a soft highlight that follows the cursor.
 *
 * Used sparingly — on hero and pricing surfaces. It makes a flat panel feel
 * like a physical object catching light. Pointer-events stay on the content, and
 * the effect is skipped entirely for reduced motion and on touch devices, where
 * there is no cursor to follow.
 */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [active, setActive] = useState(false);

  const bg = useTransform([x, y], ([cx, cy]) =>
    `radial-gradient(340px circle at ${cx}px ${cy}px, hsl(var(--primary) / 0.12), transparent 70%)`,
  );

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <div
      className={`relative ${className || ""}`}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
        setActive(true);
      }}
      onPointerLeave={() => setActive(false)}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{ background: bg as any, opacity: active ? 1 : 0 }}
      />
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- Page shell */

/**
 * Wraps page content so a route change fades in rather than snapping.
 *
 * Deliberately fade-and-lift only, with no exit animation: an exit would delay
 * the new page to play out the old one, which makes a fast app feel slower. The
 * navigation progress bar covers the waiting; this covers the arrival.
 */
export function PageIn({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export { motion, AnimatePresence, useReducedMotion, useSpring };
