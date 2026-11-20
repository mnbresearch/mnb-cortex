/*
  THE NAMED COMPARISON, PINNED.

  Run with:  npm run test:compare

  /compare and /compare/<slug> make statements about other companies. These
  are the rules that keep them fair and defensible (ASCI Code Ch. IV:
  comparisons must be factual, verifiable and not denigrating):

    - every competitor has sources on its own domain, and an as-of date shows;
    - silence is reported as "Not stated on the pages we read", never "No";
    - no cell rates another company's price, and no "cheaper"/"fraction of";
    - no superlatives about ourselves ("best", "#1", "only", "leading");
    - every competitor has a "choose them if" — the page concedes;
    - our own column names only capabilities that exist in code;
    - every slug page is in the sitemap and renders from the same data.
*/
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

let pass = 0;
const fails = [];
const check = (c, n, d = "") => { if (c) pass++; else fails.push(`${n}${d ? ` — ${d}` : ""}`); };
const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const dir = mkdtempSync(join(tmpdir(), "compare-"));
writeFileSync(join(dir, "competitors.ts"), read("src/lib/competitors.ts"));
const C = await import(pathToFileURL(join(dir, "competitors.ts")).href);

check(/\d{1,2} \w+ 20\d\d/.test(C.AS_OF), "an as-of date is set", C.AS_OF);
check(C.COMPETITORS.length >= 4, "at least four named competitors");
for (const c of C.COMPETITORS) {
  const host = new URL(c.url).hostname.replace(/^www\./, "").split(".").slice(-2).join(".");
  check(c.sources.length > 0 && c.sources.every((s) => /^https:\/\//.test(s.url)), `${c.name}: has https sources`);
  check(c.sources.some((s) => new URL(s.url).hostname.includes(host)), `${c.name}: at least one source is the company's own site`);
  for (const k of C.ROW_ORDER) {
    const v = c.cells[k];
    check(typeof v === "string" && v.length > 3, `${c.name}: ${k} is filled`);
    check(!/^(no|none|n\/a|✗|x)\.?$/i.test(v.trim()), `${c.name}: ${k} never says a flat "No"`, v);
  }
  check(c.chooseThem.length > 40 && c.chooseCortex.length > 40, `${c.name}: concedes when they fit better, and says when Cortex does`);
  check(/^[a-z0-9-]+-alternative$/.test(c.slug), `${c.name}: slug is an "-alternative" page`, c.slug);
  check(!/cheap|cheaper|fraction of|expensive|overpriced/i.test(Object.values(c.cells).join(" ")), `${c.name}: no price judgement about them`);
}
const allText = JSON.stringify(C.CORTEX) + JSON.stringify(C.COMPETITORS) + JSON.stringify(C.TOPICS);
check(!/\b(best|#1|number one|world'?s leading|industry-leading|only one|unmatched|unrivalled|unrivaled)\b/i.test(allText), "no superlatives in the comparison data");
check(/No third-party attestation yet/.test(C.CORTEX.security), "our own security cell is honest about attestations");

/* Our column names things that exist. */
const exists = (p) => existsSync(p);
check(exists("src/lib/agents/studio.ts") && /Agent Studio/.test(C.CORTEX.customAgents), "Agent Studio exists for the custom-agents claim");
check(exists("src/lib/veritas.ts") && /Veritas v1/.test(C.CORTEX.verification), "Veritas exists for the verification claim");
for (const m of ["itc", "msme", "compliance", "tds", "close"]) check(exists(`src/app/(app)/${m}/page.tsx`), `module /${m} exists for the statutory/close claims`);
for (const t of C.TOPICS) {
  const path = t.href.split("#")[0] || "/";
  const file = path === "/" ? "src/app/page.tsx" : `src/app${path}/page.tsx`;
  const parent = path.split("/").slice(0, -1).join("/");
  check(exists(file) || exists(`src/app${parent}/[slug]/page.tsx`), `topic "${t.q}" links to a page that exists`, t.href);
}

/* The pages. */
const hub = strip(read("src/app/compare/page.tsx"));
const slug = strip(read("src/app/compare/[slug]/page.tsx"));
for (const [n, s] of [["hub", hub], ["slug page", slug]]) {
  check(/AS_OF/.test(s) && /NOT_STATED/.test(s), `${n}: shows the as-of date and explains "not stated"`);
  check(/not affiliated/.test(s) && /contact@mnbresearch\.com/.test(s), `${n}: trademark note and a corrections address`);
  check(/rel="noopener noreferrer nofollow"/.test(s), `${n}: outbound source links are nofollow`);
  check(!/\b(best|#1|number one)\b/i.test(s.replace(/"[^"]*keywords[^"]*"/g, "")), `${n}: no superlatives`);
}
check(/generateStaticParams/.test(slug) && /FAQPage/.test(slug) && /notFound\(\)/.test(slug), "slug pages are static, carry FAQ structured data, and 404 on unknown slugs");
const sitemap = read("src/app/sitemap.ts");
check(/COMPETITORS\.map\(\(c\) => `\/compare\/\$\{c\.slug\}`\)/.test(sitemap) && /compareRoutes\.map/.test(sitemap), "every comparison page is in the sitemap, derived from the data");

console.log(`\ncompare: ${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("\nFAILURES:\n  - " + fails.join("\n  - ") + "\n"); process.exit(1); }
