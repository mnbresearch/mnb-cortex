#!/usr/bin/env node
/**
 * Colour-token contrast tests.  Run: npm run test:contrast
 *
 * WHY THIS SUITE EXISTS
 *
 * Dark mode was reported as "so bad", and the instinct is to reach for the
 * colour picker and nudge things until they look better. Measuring first said
 * something different and more useful: dark-mode TEXT contrast was never the
 * problem (body text scored 16:1, three times the AA requirement). The problem
 * was SURFACE SEPARATION — --card sat 3 lightness points above --background
 * (1.07:1) and --border was dimmer than the card it outlined (1.23:1), so
 * cards, inputs, the topbar and the sidebar all melted into a single flat slab.
 * A dark UI cannot lean on drop shadows the way a light one does, so the border
 * has to carry the edge, and separation has to be asserted, not eyeballed.
 *
 * Measuring also turned up two failures in LIGHT mode that nobody had reported
 * and that no amount of dark-mode work would have found:
 *   --primary  gold  on ivory  3.09:1  (needed 4.5) — used as link/body text
 *   --warning  amber on ivory  2.68:1  (needed 4.5) — 104 usages of status text
 *
 * This file PARSES src/app/globals.css rather than hardcoding the palette, so
 * the test cannot silently drift away from the tokens it claims to check. Edit
 * a colour, and this either still passes or tells you exactly what you broke.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");

/* ---- Parse the token blocks out of the real stylesheet ------------------- */

function block(selector) {
  // Matches `:root {` / `.dark {` exactly — NOT `.dark .glass {`, which would
  // otherwise swallow the wrong rule and quietly test nothing.
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const m = CSS.match(re);
  if (!m) throw new Error(`Could not find the ${selector} block in globals.css`);
  const tokens = {};
  for (const line of m[1].split("\n")) {
    const t = line.match(/--([a-z0-9-]+)\s*:\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%/i);
    if (t) tokens[t[1]] = [Number(t[2]), Number(t[3]), Number(t[4])];
  }
  return tokens;
}

/* ---- WCAG 2.1 relative luminance ---------------------------------------- */

function hslToRgb([h, s, l]) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
const channel = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (rgb) => {
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function contrast(a, b) {
  const la = luminance(hslToRgb(a)), lb = luminance(hslToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ---- Harness ------------------------------------------------------------- */

let pass = 0, fail = 0;
function expect(label, tokens, fg, bg, min, kind) {
  if (!tokens[fg] || !tokens[bg]) { fail++; console.log(`  FAIL  ${label} — missing token --${!tokens[fg] ? fg : bg}`); return; }
  const r = contrast(tokens[fg], tokens[bg]);
  const ok = r >= min;
  if (ok) { pass++; console.log(`  ok    ${label.padEnd(40)} ${r.toFixed(2)}`); }
  else { fail++; console.log(`  FAIL  ${label.padEnd(40)} ${r.toFixed(2)}  (need ${min} — ${kind})`); }
}

const AA = 4.5;                 // WCAG AA, normal-size text
const SEPARATION = 1.15;        // a card must read as a distinct surface
const EDGE = 1.30;              // a border must be visible against what it outlines

const light = block(":root");
const dark = block(".dark");

/*
  Text pairs. These are the combinations the app actually renders: semantic
  colours are used as TEXT roughly 450 times across the codebase and as a solid
  fill only ~33 times, which is why they are checked against the page and card
  backgrounds rather than against their own -foreground.
*/
const TEXT_PAIRS = [
  ["body on background", "foreground", "background"],
  ["body on card", "foreground", "card"],
  ["muted text on background", "muted-foreground", "background"],
  ["muted text on card", "muted-foreground", "card"],
  ["muted text on muted surface", "muted-foreground", "muted"],
  ["primary as text on background", "primary", "background"],
  ["primary as text on card", "primary", "card"],
  ["button label on primary", "primary-foreground", "primary"],
  ["secondary label on secondary", "secondary-foreground", "secondary"],
  ["accent label on accent", "accent-foreground", "accent"],
  ["success text on background", "success", "background"],
  ["success text on card", "success", "card"],
  ["warning text on background", "warning", "background"],
  ["warning text on card", "warning", "card"],
  ["danger text on background", "danger", "background"],
  ["danger text on card", "danger", "card"],
  ["label on solid success", "success-foreground", "success"],
  ["label on solid warning", "warning-foreground", "warning"],
  ["label on solid danger", "danger-foreground", "danger"],
];

for (const [themeName, tokens] of [["LIGHT", light], ["DARK", dark]]) {
  console.log(`\n${themeName} — text legibility (WCAG AA ${AA}:1)`);
  for (const [label, fg, bg] of TEXT_PAIRS) {
    // -foreground variants are only declared once, in :root; fall back to it.
    const t = { ...light, ...tokens };
    expect(label, t, fg, bg, AA, "WCAG AA");
  }
}

/*
  Separation is asserted for DARK only. In light mode a card is distinguished by
  a drop shadow, which is genuinely visible against a pale background; in dark
  mode that shadow disappears into the canvas, so lightness and border have to
  do the whole job.
*/
console.log(`\nDARK — surface separation (the defect that made it "so bad")`);
expect("card is distinct from background", dark, "card", "background", SEPARATION, "surface separation");
expect("border is visible against card", dark, "border", "card", EDGE, "visible edge");
expect("border is visible against background", dark, "border", "background", EDGE, "visible edge");
expect("input is visible against card", dark, "input", "card", EDGE, "visible edge");
expect("muted surface is distinct from card", dark, "muted", "card", 1.10, "surface separation");

/*
  ---- Workspace brand accents ------------------------------------------------

  Branding.tsx OVERWRITES --primary and --ring with the workspace's chosen
  accent, so checking globals.css alone proves nothing about what a customer
  actually sees. When these were a single value shared by both themes, all
  eight failed AA in one theme or the other, and the dark-leaning ones were
  severe: indigo scored 2.68:1 on a dark card, violet 2.78:1. A workspace on
  either had a near-invisible accent across the whole of dark mode.

  Parsed out of lib/utils.ts for the same reason the tokens are parsed out of
  globals.css: the test must read what ships, not a copy of it.
*/
const UTILS = readFileSync(join(ROOT, "src", "lib", "utils.ts"), "utf8");
const accents = {};
{
  const m = UTILS.match(/export const ACCENTS[^{]*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error("Could not find the ACCENTS map in src/lib/utils.ts");
  const re = /(\w+)\s*:\s*\{\s*light:\s*"([^"]+)"\s*,\s*dark:\s*"([^"]+)"\s*\}/g;
  let g;
  while ((g = re.exec(m[1]))) {
    const hsl = (s) => s.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/).slice(1, 4).map(Number);
    accents[g[1]] = { light: hsl(g[2]), dark: hsl(g[3]) };
  }
  if (!Object.keys(accents).length) throw new Error("Parsed ACCENTS but found no light/dark pairs");
}

console.log("\nBRAND ACCENTS — each must clear AA in the theme it serves");
for (const [name, pair] of Object.entries(accents)) {
  // Light mode: the page background is the stricter of background/card for a
  // dark accent. Dark mode: the raised card is the stricter for a light one.
  for (const [themeName, tokens, key, against] of [
    ["light", light, "light", "background"],
    ["dark", dark, "dark", "card"],
  ]) {
    const r = contrast(pair[key], tokens[against]);
    const ok = r >= AA;
    const label = `${name} on ${themeName} ${against}`;
    if (ok) { pass++; console.log(`  ok    ${label.padEnd(40)} ${r.toFixed(2)}`); }
    else { fail++; console.log(`  FAIL  ${label.padEnd(40)} ${r.toFixed(2)}  (need ${AA} — WCAG AA)`); }
  }
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
