import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function inr(n: number, compact = true): string {
  if (n == null || isNaN(n)) return "—";
  if (compact) {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  }
  return `₹${n.toLocaleString("en-IN")}`;
}

export function pct(n: number): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export const statusColor: Record<string, string> = {
  green: "text-success",
  yellow: "text-warning",
  red: "text-danger",
};
export const statusBg: Record<string, string> = {
  green: "bg-success/10 text-success border-success/20",
  yellow: "bg-warning/10 text-warning border-warning/20",
  red: "bg-danger/10 text-danger border-danger/20",
};

/**
 * Escape every character that can start markup, BEFORE any markdown runs.
 *
 * This function's output goes to `dangerouslySetInnerHTML` in 24 places. What
 * flows through it is model output and, via Cortex Memory, text another member
 * of the workspace typed. Without this pass, `<img src=x onerror=alert(1)>` in
 * any of those reaches the DOM and executes.
 *
 * That is not a theoretical severity here. Supabase's SSR client sets the auth
 * cookies with httpOnly:false — the access and refresh tokens are readable from
 * `document.cookie` — so one XSS in this app is a full account takeover, not a
 * defacement. Escaping at the source is the fix; the CSP added in
 * next.config.mjs is only the second line.
 *
 * Order matters: `&` first, or the escapes below get double-escaped.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal markdown -> HTML for AI answers.
 *
 * Safe by construction: the input is fully escaped first, so the ONLY tags in
 * the output are the ones the replacements below put there. Markdown syntax
 * (#, *, _, -) survives escaping untouched, so nothing is lost.
 */
export function mdToHtml(s: string): string {
  return escapeHtml(s || "")
    .replace(/^### (.*)$/gm, "<h3 class='font-semibold mt-4 mb-1'>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2 class='text-base font-semibold mt-4 mb-1.5'>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1 class='text-lg font-bold mt-4 mb-2'>$1</h1>")
    .replace(/^\s*[-*] (.*)$/gm, "<li class='ml-5 list-disc'>$1</li>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/\n/g, "<br/>");
}

export function leadScore(c: any): number {
  let s = 40;
  if (c.status === "active") s += 30; else if (c.status === "lead") s += 10; else s -= 20;
  const v = Number(c.value) || 0; s += Math.min(25, (v / 50000) * 25);
  if (c.last_touch) { const days = (Date.now() - new Date(c.last_touch).getTime()) / 864e5; if (days < 7) s += 10; else if (days > 60) s -= 15; }
  return Math.max(1, Math.min(100, Math.round(s)));
}
export function scoreTone(n: number): string {
  return n >= 70 ? "bg-success/10 text-success border-success/20" : n >= 45 ? "bg-warning/10 text-warning border-warning/20" : "bg-danger/10 text-danger border-danger/20";
}

/**
 * Workspace brand accents, as a LIGHT/DARK PAIR per colour.
 *
 * These used to be a single value applied to both themes, and every one of the
 * eight failed WCAG AA as text in one theme or the other — because a colour
 * legible on ivory is by definition close to invisible on graphite, and vice
 * versa. The dark-leaning accents were the worst of it: indigo scored 2.68:1
 * on a dark card and violet 2.78:1, so a workspace that picked either had a
 * near-unreadable accent throughout dark mode. That is a big part of why dark
 * mode was reported as bad, and it is invisible to any check that only looks
 * at globals.css, because Branding overwrites --primary at runtime.
 *
 * Each pair keeps the hue (so the brand still reads as "indigo") and moves
 * lightness until it clears AA against the background of the theme it serves,
 * nudging saturation up as lightness drops so the darker light-mode variants
 * stay vivid rather than going muddy.
 *
 * Verified in both themes by scripts/test-contrast.mjs.
 */
export type AccentPair = { light: string; dark: string };
export const ACCENTS: Record<string, AccentPair> = {
  gold:    { light: "40 74% 33%",  dark: "40 54% 45%" },
  emerald: { light: "158 93% 26%", dark: "158 67% 45%" },
  cyan:    { light: "190 95% 29%", dark: "190 77% 45%" },
  indigo:  { light: "244 75% 50%", dark: "244 68% 69%" },
  violet:  { light: "271 76% 50%", dark: "271 68% 66%" },
  rose:    { light: "347 79% 48%", dark: "347 69% 62%" },
  amber:   { light: "34 95% 33%",  dark: "34 85% 45%" },
  sky:     { light: "199 95% 34%", dark: "199 80% 45%" },
};
/** The accents offered in Settings. Derived so the picker cannot drift from
 *  the palette — it previously hardcoded a list that silently omitted cyan. */
export const ACCENT_NAMES = Object.keys(ACCENTS);
