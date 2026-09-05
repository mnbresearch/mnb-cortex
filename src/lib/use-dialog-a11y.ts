"use client";
import { useEffect, useRef } from "react";

/**
 * Make an existing hand-rolled overlay behave like a dialog.
 *
 * WHY A HOOK AND NOT JUST THE Modal COMPONENT.
 *
 * `components/ui/modal.tsx` is the right destination for all of these, and the
 * three that render app-wide have moved to it. But there are ten more overlays
 * with bespoke layout — a full-bleed command palette, a pricing sheet, an email
 * composer — and rewriting each one's markup to fit a shared shell is a change
 * with real regression risk for a defect that is fixable in one line per file.
 *
 * So: the component where the markup is generic, this hook where it is not.
 * Both give the same three things, which are the ones actually missing:
 *
 *   Escape closes it. Six of these could not be dismissed by keyboard AT ALL —
 *   not "awkward", but genuinely trapped, which is the most severe kind of
 *   accessibility failure.
 *
 *   Tab stays inside. A modal that blocks the page visually must block the tab
 *   order too, or the two disagree about what is interactive and the user tabs
 *   into content they cannot see or click.
 *
 *   Focus returns to whatever opened it. Without this, closing drops focus to
 *   <body> and a keyboard user restarts from the top of the page every time.
 *
 * Spread the returned props onto the PANEL element (the inner box, not the
 * backdrop) and it is labelled and focusable.
 */
export function useDialogA11y(open: boolean, onClose: () => void, label: string) {
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
      ).filter((el) => el.offsetParent !== null);

    const id = requestAnimationFrame(() => {
      (focusables()[0] ?? panel.current)?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || !panel.current?.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !panel.current?.contains(active))) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      const back = returnTo.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open, onClose, label]);

  return {
    ref: panel,
    role: "dialog" as const,
    "aria-modal": true as const,
    "aria-label": label,
    tabIndex: -1,
  };
}
