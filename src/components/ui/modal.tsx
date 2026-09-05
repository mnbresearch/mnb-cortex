"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * One accessible dialog, so thirteen hand-rolled ones can stop being wrong.
 *
 * WHAT THEY WERE.
 *
 * Thirteen of fourteen overlays in this codebase were a bare
 * `<div onClick={close}>` with `stopPropagation` on the inner panel. Only the
 * onboarding tour had `role="dialog"`. None trapped focus, so Tab walked
 * straight out of the dialog into the page behind it — which the overlay was
 * still covering with the mouse. And only four handled Escape, meaning
 * `mobile-nav`, `whats-new`, `daily-nudge`, `pricing-client`,
 * `integrations-manager` and `email-studio` could not be dismissed by keyboard
 * AT ALL. Two of those render from the app layout, so potentially over any
 * page. That is a keyboard trap, which is the most severe kind of
 * accessibility defect: not "hard to use" but "cannot leave".
 *
 * WHAT THIS DOES, AND WHY EACH PIECE.
 *
 *   role="dialog" + aria-modal + a label — a screen reader announces that a
 *   dialog opened and what it is for, instead of reading nothing.
 *
 *   Focus moves IN on open and BACK on close. Returning focus is the half
 *   people forget; without it, closing a dialog drops focus to <body> and the
 *   user restarts from the top of the page.
 *
 *   Tab and Shift+Tab cycle within the panel. A modal that visually blocks the
 *   page must block the tab order too, or the two disagree about what is
 *   interactive.
 *
 *   Escape closes. The single most expected keyboard behaviour there is.
 *
 *   Background scroll is locked, because a dialog that scrolls the page behind
 *   it loses the reader's place.
 */
export function Modal({
  open, onClose, label, children, className = "", initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  /** Announced when the dialog opens. Required — an unlabelled dialog is "dialog". */
  label: string;
  children: ReactNode;
  className?: string;
  /** Where focus should land. Defaults to the first focusable element. */
  initialFocus?: React.RefObject<HTMLElement>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnTo.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([type="hidden"]), select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    /* Focus in. rAF so the panel has painted and offsetParent is meaningful. */
    const id = requestAnimationFrame(() => {
      (initialFocus?.current ?? focusables()[0] ?? panel.current)?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;

      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement as HTMLElement;

      /* Wrap at both ends, and pull focus back in if it has escaped. */
      if (e.shiftKey && (active === first || !panel.current?.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !panel.current?.contains(active))) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      /* Focus back where it came from, if that element still exists. */
      const back = returnTo.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open, onClose, initialFocus]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`w-full max-w-lg rounded-2xl border bg-card shadow-2xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
