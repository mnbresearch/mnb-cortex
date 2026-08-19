"use client";

/**
 * Top-of-page navigation progress bar.
 *
 * Every page in this app is a server component that fetches before it renders,
 * so clicking a nav link produced no feedback at all until the new page was
 * ready — on a cold serverless function that is a second or more of a UI that
 * looks broken. This is the cheapest, largest perceived-performance win
 * available, and it is why GitHub, Vercel and YouTube all ship one.
 *
 * Next 14's App Router gives no navigation-start event (useLinkStatus is 15+),
 * so the start is detected by capturing link clicks and the finish by observing
 * the pathname actually change.
 *
 * The bar eases toward 90% and waits there. Never showing 100% until the page
 * truly arrives keeps it honest: a bar that completes while you're still
 * waiting teaches people to distrust it.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Finish whenever the route actually changes.
  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setProgress((p) => (p > 0 ? 100 : 0));
    hideTimer.current = setTimeout(() => { setVisible(false); setProgress(0); }, 260);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search?.toString()]);

  useEffect(() => {
    function start() {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (timer.current) clearInterval(timer.current);
      setVisible(true);
      setProgress(8);
      // Decelerating crawl toward 90%: fast while there's lots of headroom,
      // slower as it approaches, so it never looks stalled or dishonest.
      timer.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.max(0.4, (90 - p) * 0.06)));
      }, 90);
    }

    function onClick(e: MouseEvent) {
      // Ignore anything that isn't a plain left-click navigation.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;

      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;

      let url: URL;
      try { url = new URL(href, window.location.origin); } catch { return; }
      if (url.origin !== window.location.origin) return;                 // external
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page

      start();
    }

    // Browser back/forward.
    function onPopState() { start(); }

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, { capture: true } as any);
      window.removeEventListener("popstate", onPopState);
      if (timer.current) clearInterval(timer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      role="progressbar"
      aria-hidden="true"
    >
      <div
        className="h-full brand-gradient"
        style={{
          width: `${progress}%`,
          transition: "width 180ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease",
          opacity: progress >= 100 ? 0 : 1,
          boxShadow: "0 0 12px hsl(var(--primary) / 0.7), 0 0 4px hsl(var(--primary) / 0.9)",
        }}
      />
    </div>
  );
}

/**
 * useSearchParams() opts the tree into client-side rendering, so it must sit
 * behind Suspense or every page using this becomes dynamic at build time.
 */
export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
