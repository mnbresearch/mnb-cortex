"use client";
import { useEffect } from "react";
import { ACCENTS } from "@/lib/utils";

/**
 * Applies the workspace's brand accent to --primary / --ring.
 *
 * WHY THIS INJECTS A STYLESHEET RATHER THAN SETTING AN INLINE VARIABLE.
 *
 * The previous version did:
 *
 *   document.documentElement.style.setProperty("--primary", hsl)
 *
 * which sets ONE value as an inline style on <html>. An inline style beats
 * every stylesheet rule, so that single colour then applied to both themes and
 * could not be varied by `.dark` at all. Since an accent that is legible on
 * ivory is close to invisible on graphite, a workspace on indigo or violet got
 * an accent scoring under 3:1 in dark mode — links, active nav items, focus
 * rings and KPI deltas all faded into the card.
 *
 * Writing a real <style> element instead lets the normal cascade do the work:
 * `:root` carries the light variant, `.dark` carries the dark one, and the
 * theme toggle switches between them instantly with no JavaScript, no
 * re-render, and no flash on the way through.
 */
export function Branding({ accent }: { accent?: string }) {
  useEffect(() => {
    const ID = "org-accent";
    const existing = document.getElementById(ID);

    // Fall through to the brand gold in globals.css for the default accents
    // ("gold"/legacy "teal") so it stays theme-aware on its own.
    const isBrandDefault = !accent || accent === "gold" || accent === "teal";
    const pair = isBrandDefault ? null : ACCENTS[accent];

    if (!pair) { existing?.remove(); return; }

    const style = existing || document.createElement("style");
    style.id = ID;
    style.textContent =
      `:root{--primary:${pair.light};--ring:${pair.light}}` +
      `.dark{--primary:${pair.dark};--ring:${pair.dark}}`;
    if (!existing) document.head.appendChild(style);

    // Clear the inline override the old implementation may have left on <html>
    // in a session that loaded before this shipped; it would outrank the rules
    // above and reintroduce the very bug this fixes.
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--ring");
  }, [accent]);
  return null;
}
