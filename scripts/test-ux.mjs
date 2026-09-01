#!/usr/bin/env node
/**
 * Navigation, onboarding and lead-capture tests.  Run: npm run test:ux
 *
 * These are the properties that decide whether someone can actually use the
 * product, and every one of them had been quietly violated:
 *
 *   - 122 modules sat in six groups, one of which held 42. Finding the TDS
 *     calculator meant reading forty-two labels.
 *   - The only search over those modules opened on Ctrl/Cmd-K and nowhere else,
 *     a shortcut a business owner has no reason to guess.
 *   - The Business Health Check — the lead magnet — was a text link near the
 *     bottom of the landing page, and collected no phone number.
 *   - Onboarding and Settings wrote DIFFERENT id spaces into the same
 *     organizations.industry column depending on which screen you used.
 *
 * None of these throw. They just make the product feel smaller and harder than
 * it is, which is exactly the kind of thing no other test would catch.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/* ========================================================================= */
console.log("\nNAVIGATION: no group may be an unscannable wall");
/* ========================================================================= */
{
  const nav = read("src", "lib", "nav.ts");
  const entries = [...nav.matchAll(/\{ href: "([^"]+)", label: "([^"]+)", icon: \w+, group: "([^"]+)"(?:, sub: "([^"]+)")? \}/g)]
    .map((m) => ({ href: m[1], label: m[2], group: m[3], sub: m[4] }));
  check(`nav parsed (${entries.length} modules)`, entries.length > 100);

  const byGroup = {};
  for (const e of entries) (byGroup[e.group] ||= []).push(e);

  // Any group past ~15 items needs sub-headings or it is a list to scroll, not
  // navigate. Money had 42.
  const LARGE = 15;
  let unsectioned = 0;
  for (const [g, items] of Object.entries(byGroup)) {
    if (items.length <= LARGE) continue;
    const withSub = items.filter((i) => i.sub).length;
    const ok = withSub === items.length;
    if (!ok) unsectioned++;
    check(`"${g}" has ${items.length} modules — all carry a sub-section`, ok);
  }
  check("no large group is left without sub-sections", unsectioned === 0);

  // A sub-section that holds almost the whole group has not divided anything.
  for (const [g, items] of Object.entries(byGroup)) {
    if (items.length <= LARGE) continue;
    const counts = {};
    for (const i of items) counts[i.sub] = (counts[i.sub] || 0) + 1;
    const biggest = Math.max(...Object.values(counts));
    check(`"${g}" is genuinely divided (largest sub-section ${biggest} of ${items.length})`,
      biggest < items.length * 0.6);
  }

  // Every module must still be reachable — a regroup must never drop one.
  check("every module still belongs to a group", entries.every((e) => e.group));
  check("no duplicate hrefs", new Set(entries.map((e) => e.href)).size === entries.length);
}

console.log("\nSEARCH: must have a visible front door, not only a shortcut");
{
  const sidebar = read("src", "components", "sidebar.tsx");
  const palette = read("src", "components", "command-palette.tsx");
  check("the sidebar renders a search control", /Search modules/.test(sidebar));
  check("...which dispatches an event the palette listens for",
    /cortex:open-palette/.test(sidebar) && /cortex:open-palette/.test(palette));
  check("the keyboard shortcut still works", /metaKey \|\| e\.ctrlKey/.test(palette));
  check("the palette still searches the whole module list", /NAV\.filter/.test(palette));
}

/* ========================================================================= */
console.log("\nLEAD MAGNET: on the landing page, and asks for a phone");
/* ========================================================================= */
{
  const landing = read("src", "app", "page.tsx");
  const hc = read("src", "components", "health-check-client.tsx");

  check("the health check is rendered ON the landing page, not just linked",
    /import \{ HealthCheckClient \}/.test(landing) && /<HealthCheckClient \/>/.test(landing));
  check("it has its own section anchor", /id="health-check"/.test(landing));

  check("the form collects a phone number", /form\.phone/.test(hc) && /type="tel"/.test(hc));
  check("phone is required, not optional", /!form\.phone/.test(hc));
  check("it also collects a business name", /form\.company/.test(hc));
  check("phone is actually sent to the API", /\.\.\.form/.test(hc));

  // The note is what makes the lead worth calling.
  check("the operator gets the score", /Business Health Score/.test(hc));
  check("...the named weak areas", /Weak areas/.test(hc));
  check("...and the individual answers", /Answers:/.test(hc));

  const inquiry = read("src", "app", "api", "inquiry", "route.ts");
  check("the API stores the phone against the lead", /phone: phone \|\| null/.test(inquiry));
  check("the API emails the operator", /notifyTo/.test(inquiry) && /sendEmail\(notifyTo/.test(inquiry));
  check("the prospect gets a confirmation too", /sendEmail\(email/.test(inquiry));

  // Section numbering must stay sequential after inserting a section.
  const nums = [...landing.matchAll(/<SectionLabel n="(\d+)">/g)].map((m) => Number(m[1]));
  check(`landing sections are numbered sequentially (01..${String(nums.length).padStart(2, "0")})`,
    nums.every((n, i) => n === i + 1));
}

/* ========================================================================= */
console.log("\nINDUSTRY PICKER: grouped, and one id space everywhere");
/* ========================================================================= */
{
  const catalog = read("src", "lib", "agents", "catalog.ts");
  const settings = read("src", "app", "(app)", "settings", "page.tsx");
  const wizard = read("src", "components", "onboarding-wizard.tsx");

  const industries = [...catalog.matchAll(/\{ id: "([a-z0-9-]+)", name: "[^"]+", emoji: "[^"]+", blurb: "[^"]+", sector: "([^"]+)" \}/g)]
    .map((m) => ({ id: m[1], sector: m[2] }));
  check(`every industry has a sector (${industries.length})`, industries.length >= 25);

  const sectors = [...catalog.matchAll(/^\s{2}"([^"]+)",$/gm)].map((m) => m[1]);
  const used = new Set(industries.map((i) => i.sector));
  check("every sector used by an industry is declared in SECTORS",
    [...used].every((s) => sectors.includes(s)));
  check("no declared sector is empty", sectors.every((s) => used.has(s)));

  check("Settings groups the picker with optgroups", /<optgroup/.test(settings));
  check("onboarding groups it the same way", /<optgroup/.test(wizard));

  /*
    The wizard used to write playbook slugs ("retail-d2c") while Settings wrote
    catalog ids ("retail") into the same column, so the value depended on which
    screen the user happened to use.
  */
  check("onboarding writes catalog ids, the same space Settings writes",
    /from "@\/lib\/agents\/catalog"/.test(wizard) && !/from "@\/lib\/industries"/.test(wizard));
}

console.log("\nONBOARDING: say what the product is before configuring it");
{
  const wizard = read("src", "components", "onboarding-wizard.tsx");
  check("it explains what Cortex does in plain words",
    /reads your business numbers/.test(wizard));
  check("it sets the time expectation", /Two minutes/.test(wizard));
  check("choosing an industry explains what it changes",
    /which problems Cortex watches/.test(wizard));
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
