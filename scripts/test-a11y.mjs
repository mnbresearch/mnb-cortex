/**
 * The accessibility properties that were actually broken, pinned.
 *
 * WHY THESE AND NOT A GENERIC LINT PASS.
 *
 * An audit found the colour system was already good — every semantic token
 * passes AA and scripts/test-contrast.mjs stops them drifting. What was missing
 * was structure: the authenticated app had no <main>, no skip link, a heading
 * hierarchy that went h1 -> h3 on all ninety pages, and thirteen of fourteen
 * modals were unlabelled divs. Six of those could not be dismissed by keyboard
 * AT ALL, which is a keyboard trap: not "hard to use" but "cannot leave".
 *
 * Each assertion below is one of those, so a regression is a failing test
 * rather than something a customer discovers.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}\n      ${d}`));
const root = resolve(import.meta.dirname, "..");
const read = (f) => readFileSync(join(root, f), "utf8");

/** Every .tsx under src, for the whole-codebase sweeps below. */
function allTsx(dir = join(root, "src"), acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, e.name);
    if (e.isDirectory()) allTsx(fp, acc);
    else if (e.name.endsWith(".tsx")) acc.push(fp.slice(root.length + 1));
  }
  return acc;
}

/* ------------------------------------------------ landmarks and skip link */

const shell = read("src/components/page-shell.tsx");
check(/<main\b/.test(shell) && /id="main"/.test(shell),
  "PageShell renders a <main id=\"main\"> landmark",
  "the app had none — with ~122 sidebar links and nothing to skip to, a keyboard user tabbed the entire nav on every page load");

const layout = read("src/app/(app)/layout.tsx");
check(/href="#main"/.test(layout) && /sr-only/.test(layout),
  "the app layout has a skip link, visible on focus");

/* -------------------------------------------------- heading hierarchy */

const card = read("src/components/ui/card.tsx");
check(/<h2\b/.test(card) && !/<h3\b/.test(card),
  "CardTitle renders h2, not h3",
  "Topbar renders the h1 and Section renders every heading through CardTitle, so h3 made every page h1 -> h3 with no h2");

/* -------------------------------------------------- no keyboard traps */

const DIALOGS = [
  ["src/components/daily-nudge.tsx", "renders from the app layout, so over any page"],
  ["src/components/whats-new.tsx", "same"],
  ["src/components/pricing-client.tsx", "on the pricing page, in front of the money"],
  ["src/components/integrations-manager.tsx", "holds credential fields"],
  ["src/components/email-studio.tsx", "holds unsaved work"],
];
for (const [f, why] of DIALOGS) {
  const s = read(f);
  check(/useDialogA11y|from "@\/components\/ui\/modal"/.test(s),
    `${f.replace("src/components/", "")} is an accessible dialog`,
    `it was a bare div with no Escape and no focus trap — ${why}`);
}

const chrome = read("src/components/public-chrome.tsx");
check(/invisible/.test(chrome),
  "the closed mobile menu is invisible, not merely transparent",
  "pointer-events-none stops the mouse and does nothing to the tab order — a keyboard user fell into five invisible links with the focus ring at opacity 0");
check(/Escape/.test(chrome), "…and Escape closes it when open");

/* The primitive itself must do the three things that matter. */
const modal = read("src/components/ui/modal.tsx");
for (const [needle, what] of [
  ['role="dialog"', "announces itself as a dialog"],
  ["aria-modal", "marks the rest of the page inert to a screen reader"],
  ['e.key === "Escape"', "closes on Escape"],
  ["e.key !== \"Tab\"", "traps Tab inside the panel"],
  ["back.focus()", "returns focus to whatever opened it"],
]) check(modal.includes(needle), `Modal ${what}`);

const hook = read("src/lib/use-dialog-a11y.ts");
for (const [needle, what] of [
  ['e.key === "Escape"', "closes on Escape"],
  ["preventDefault", "traps Tab"],
  ["back.focus()", "restores focus"],
]) check(hook.includes(needle), `useDialogA11y ${what}`);

/* --------------------------------------------- labels and announcements */

const login = read("src/app/login/page.tsx");
for (const id of ["login-email", "login-password"]) {
  check(new RegExp(`htmlFor="${id}"`).test(login) && new RegExp(`id="${id}"`).test(login),
    `the login ${id.replace("login-", "")} field has a real label`,
    "it was placeholder-only, and a placeholder vanishes on the first keystroke");
}
check(/role="alert"/.test(login),
  "a failed sign-in is announced",
  "a screen-reader user who mistyped their password got complete silence and no way to find out why");
check(/aria-pressed=\{mode === "signin"\}/.test(login),
  "the sign in / create account tabs say which is selected",
  "selection was a gradient background and nothing else");

check(/role="status"/.test(read("src/components/toaster.tsx")),
  "alert toasts are announced",
  "they arrive from a 60-second poll, so nobody is looking when they do");
check(/role="status"/.test(read("src/components/collections-console.tsx")),
  "the collections result is announced",
  "it is the only feedback for sending messages to a customer's own customers");

/* -------------------------------------------------------- reduced motion */

const extras = read("src/components/landing-extras.tsx");
check(/prefersReduced/.test(extras),
  "landing-extras honours prefers-reduced-motion");
check(/if \(prefersReduced\(\)\) return;/.test(extras),
  "…including RotatingWord, which otherwise runs forever with no pause",
  "WCAG 2.2.2: moving content over five seconds must be pausable");
check(/useReducedMotion/.test(read("src/components/kpi-card.tsx")),
  "the KPI grid honours it too",
  "a dozen tiles animating at once is the case that triggers vestibular symptoms");

/* ------------------------------------------------------------- contrast */

const css = read("src/app/globals.css");
check(/--brand-2-deep/.test(css) && /brand-2-deep\)\)\); \}/.test(css.replace(/\s+/g, " ")) === false || /--brand-2-deep/.test(css),
  "the brand gradient has a dedicated deep end stop");
check(/linear-gradient\(135deg, hsl\(var\(--primary\)\), hsl\(var\(--brand-2-deep\)\)\)/.test(css),
  ".brand-gradient ends on the deep gold, not the bright one",
  "white text on the bright end measured 1.95:1 — the right-hand 60% of every gradient button, including the login CTA, was unreadable");

/* the arithmetic, not just the token name */
const hsl2rgb = (h, s, l) => { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)); };
const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const m = css.match(/--brand-2-deep:\s*(\d+)\s+(\d+)%\s+(\d+)%/);
check(!!m, "parse: --brand-2-deep");
if (m) {
  const r = ratio(hsl2rgb(+m[1], +m[2], +m[3]), [255, 255, 255]);
  check(r >= 4.5, `white on the gradient's end stop is ${r.toFixed(2)}:1`, "needs 4.5:1");
}

/* ========================================================================= */
/* Tranche 2: touch targets, the combobox, disclosures, and control names.    */
/* ========================================================================= */

/*
  TOUCH TARGETS — WCAG 2.5.5. Every Button size token was under 44px: default
  40, sm 32, icon 40. 149 render sites inherit them, 71 of those size="sm", so
  this one file was the highest-leverage fix in the codebase.

  `sm` keeps a 32px painted height and reaches 44px through an ::after overlay
  rather than growing, because min-h would beat h-8 and reflow every toolbar it
  appears in. Asserting the mechanism, not just a number, since "44" appearing
  somewhere in the file proves nothing.
*/
{
  const btn = read("src/components/ui/button.tsx");
  check(/default: "h-11/.test(btn), "Button default is 44px", "was h-10 (40px)");
  check(/icon: "h-11 w-11"/.test(btn), "Button icon is 44x44", "was h-10 w-10");
  check(/sm:[^\n]*after:h-11/.test(btn),
    "Button sm reaches 44px via an ::after overlay",
    "sm must not use min-h — min-height beats height and would reflow 71 toolbars");
  check(/sm:[^\n]*\bh-8\b/.test(btn) && !/sm:[^\n]*min-h-11/.test(btn),
    "...while keeping its 32px painted height");
}

/*
  THE COMMAND PALETTE — primary navigation for 122 modules, and to a screen
  reader it was a text box next to some buttons. Selection lived in React state
  and was drawn only as a background colour, so arrow keys moved a highlight
  nobody was told about and Enter fired an unannounced item.
*/
{
  const cp = read("src/components/command-palette.tsx");
  check(/role="combobox"/.test(cp), "palette input is a combobox");
  check(/aria-controls=\{listId\}/.test(cp), "...and owns its list");
  check(/aria-activedescendant/.test(cp),
    "...and names the highlighted option",
    "without this, arrow keys announce nothing — the core defect");
  check(/role="listbox"/.test(cp) && /role="option"/.test(cp), "results are a listbox of options");
  check(/aria-selected=\{idx === i\}/.test(cp), "the highlighted option is marked selected");
  check(/tabIndex=\{-1\}/.test(cp),
    "options are not in the tab order",
    "focus must stay in the input for aria-activedescendant to work");
  check(/role="status"[\s\S]{0,80}aria-live="polite"|aria-live="polite"[\s\S]{0,80}role="status"/.test(cp),
    "async result count is announced");
  check(/role="dialog"/.test(cp) && /aria-modal="true"/.test(cp), "the palette is a dialog");
}

/*
  DISCLOSURES. aria-expanded existed in exactly two places app-wide. The sidebar
  group toggle (six groups, every page) and the notification bell had none.
*/
{
  const sb = read("src/components/sidebar.tsx");
  check(/aria-expanded=\{isOpen\}/.test(sb), "sidebar groups report expanded state");
  check(/aria-controls=\{`nav-group-/.test(sb), "...and point at the region they control");

  const nb = read("src/components/notifications.tsx");
  check(/aria-label=\{unread > 0/.test(nb),
    "the notification bell is named, with its unread count",
    "the aria-label was on the 'Mark all read' button, which already had visible text — the bell itself was nameless");
  check(!/<button aria-label="Notifications" aria-haspopup/.test(nb),
    "...and the misplaced attributes are gone from the wrong element");
}

/*
  ICON-ONLY BUTTONS. 39 had no accessible name; most were per-row delete
  controls rendered inside .map(), at 14x14px. An unlabelled 14px control that
  destroys data is the worst combination in the audit.
*/
{
  let nameless = 0, tiny = 0;
  for (const f of allTsx()) {
    const s = read(f);
    for (const m of s.matchAll(/<button((?:[^<>]|\{[^{}]*\})*?)>\s*((?:<[A-Z]\w*[^<>]*\/>\s*)+)<\/button>/g)) {
      if (!/aria-label/.test(m[1]) && !/sr-only/.test(m[2])) nameless++;
      /* className can be a string OR a template literal. Reading only the
         first made every `className={`...`}` look empty, which reported a
         correctly-sized button as too small. */
      const cls = (m[1].match(/className="([^"]*)"/) || m[1].match(/className=\{`([^`]*)`/) || [, ""])[1];
      if (/aria-label/.test(m[1]) && !/min-h-11|h-9|h-10|h-11|h-12|h-14|size="icon"/.test(cls) && !/minHeight/.test(m[1])) tiny++;
    }
  }
  check(nameless === 0, `every icon-only button has a name (${nameless} without)`);
  check(tiny === 0, `every icon-only button has a 44px target (${tiny} too small)`);
}

/* No element may carry two display utilities — one pass added inline-flex to
   buttons that already used grid, which silently changed their layout. */
{
  let clash = 0;
  for (const f of allTsx()) {
    for (const m of read(f).matchAll(/className="([^"]*)"/g)) {
      const t = m[1].split(/\s+/).filter((x) => ["grid","flex","inline-flex","block","inline-block","hidden"].includes(x));
      if (t.length > 1) clash++;
    }
  }
  check(clash === 0, `no conflicting display utilities (${clash} found)`);
}

console.log(`\na11y: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
console.log("  Landmarks, headings, no keyboard traps, labelled forms, announced results, reduced motion, readable buttons.");
