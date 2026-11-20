"use client";
import { useEffect, useRef, useState } from "react";
import { Play, X, Volume2 } from "lucide-react";

/*
  THE PRODUCT FILM, in the hero.

  public/media/cortex-film-loop.mp4 is the MNB Cortex launch film (MNB Research
  video studio, Nov 2026) cut to its first 29 seconds with the sound removed —
  the old end card ("early-warning system") is trimmed off because the product
  has moved on from that line. It plays muted and looped as the hero visual;
  "Watch the film" opens the same cut with its voice-over.

  The figures on the dashboard in the film are illustrative, and the caption
  under the frame says so — the same rule every mock-up on this site follows.

  Reduced motion: no autoplay; the poster stands in and the film is one click
  away.
*/
export function HeroFilm() {
  const loop = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const v = loop.current;
    if (!v) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { v.pause(); return; }
    v.play().catch(() => { /* autoplay refused: the poster shows */ });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div className="relative">
        <div className="absolute -inset-x-10 -top-10 -bottom-16 aura pointer-events-none" aria-hidden />
        <div className="relative rounded-[22px] border bg-card p-1.5 sm:p-2 glow-gold">
          <div className="flex items-center gap-1.5 px-3 pb-2 pt-1" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="ml-3 hidden sm:inline text-[11px] text-muted-foreground">mnbcortex.app</span>
          </div>
          <div className="relative overflow-hidden rounded-[16px] bg-black aspect-video">
            <video
              ref={loop}
              className="h-full w-full object-cover"
              src="/media/cortex-film-loop.mp4"
              poster="/media/cortex-film-poster.jpg"
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="MNB Cortex product film, playing without sound"
            />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="group absolute left-3 bottom-3 sm:left-6 sm:bottom-6 inline-flex items-center gap-2 sm:gap-3 rounded-full bg-background/90 backdrop-blur pl-1 sm:pl-1.5 pr-3.5 sm:pr-5 h-9 sm:h-12 text-xs sm:text-sm font-medium text-foreground shadow-lg hover:bg-background transition-colors"
            >
              <span className="grid place-items-center h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-105">
                <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />
              </span>
              Watch the film <span className="text-muted-foreground font-normal">0:29</span>
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">Product film · figures on screen are illustrative</p>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="MNB Cortex film"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-12 right-0 h-10 w-10 grid place-items-center rounded-full border border-white/30 text-white hover:bg-white/10"
              aria-label="Close film"
              autoFocus
            >
              <X className="h-5 w-5" />
            </button>
            <video
              className="w-full rounded-2xl bg-black aspect-video"
              src="/media/cortex-film.mp4"
              poster="/media/cortex-film-poster.jpg"
              controls
              autoPlay
              playsInline
            />
            <p className="mt-3 flex items-center gap-2 text-xs text-white/60"><Volume2 className="h-3.5 w-3.5" /> With voice-over. Figures on screen are illustrative.</p>
          </div>
        </div>
      )}
    </>
  );
}
