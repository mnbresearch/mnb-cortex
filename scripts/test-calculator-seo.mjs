/*
  The calculators as an acquisition surface.

  WHAT WENT WRONG WITHOUT THIS

  All 29 calculators are public and working. Every one of them served the ROOT
  LAYOUT'S metadata — twenty-nine pages with the identical title, "MNB Cortex —
  Know what's going wrong, before it costs you", and the identical site-wide
  description. None appeared in sitemap.xml. robots.ts allowed them, so a
  crawler could reach all 29 and could not tell them apart.

  A code comment on the index page asserted they were "good acquisition
  surface". That was an intention with nothing implementing it, and nothing
  checking — which is why it survived a repositioning, a repricing and three
  audits.

  So this file checks the two things that decay silently:

  1. COVERAGE. Every route marked `calc: true` in nav.ts has its own title,
     description and sitemap entry. Add a thirtieth calculator and forget the
     copy, and the suite says so — rather than the page quietly inheriting the
     home page's title for a year.

  2. DISTINCTIVENESS. No two calculators share a title or a description. Two
     pages making the same claim compete with each other, and the usual way
     that happens is copy-paste when adding the seventh one.

  Both are static checks over the source, because both failure modes are
  invisible at runtime — the pages render perfectly either way.
*/
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
}

const navSrc = readFileSync("src/lib/nav.ts", "utf8");
const seoSrc = readFileSync("src/lib/calculator-seo.ts", "utf8");
const siteSrc = readFileSync("src/app/sitemap.ts", "utf8");

/* Routes the nav declares as standalone calculators. */
const navRoutes = [...navSrc.matchAll(/href:\s*"(\/[a-z0-9-]+)"[^}]*calc:\s*true/g)].map((m) => m[1]);
check("parse: found the calculators in nav.ts", navRoutes.length >= 25, `found ${navRoutes.length}`);

/* Routes the SEO map covers. */
const seoRoutes = [...seoSrc.matchAll(/^\s*"(\/[a-z0-9-]+)":\s*\{/gm)].map((m) => m[1]);
check("parse: read the SEO map", seoRoutes.length >= 25, `found ${seoRoutes.length}`);

/* ------------------------------------------------------------- coverage -- */

for (const r of navRoutes) {
  check(`${r} has its own title and description`, seoRoutes.includes(r),
    "without an entry the page inherits the root layout's generic title, which every other calculator also has");
}

/* And nothing in the map that is not a real calculator — a stale entry writes
   a sitemap URL for a page that may not exist. */
for (const r of seoRoutes) {
  check(`${r} is a real calculator route`, navRoutes.includes(r),
    "an entry with no matching page puts a 404 in the sitemap");
}

/* The page file must actually call calcMetadata — the map alone does nothing. */
for (const r of seoRoutes) {
  const file = `src/app/(app)${r}/page.tsx`;
  if (!existsSync(file)) { check(`${r} page exists`, false, `${file} not found`); continue; }
  const src = readFileSync(file, "utf8");
  check(`${r}/page.tsx exports metadata`,
    new RegExp(`calcMetadata\\("${r}"\\)`).test(src),
    "the SEO map is inert unless the page exports it; this is the step most likely to be forgotten");
}

/* ------------------------------------------------------- distinctiveness -- */

const titles = [...seoSrc.matchAll(/title:\s*"([^"]+)"/g)].map((m) => m[1]);
const descs = [...seoSrc.matchAll(/description:\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]);

const dupTitles = titles.filter((t, i) => titles.indexOf(t) !== i);
check("no two calculators share a title", dupTitles.length === 0, `duplicated: ${[...new Set(dupTitles)].join(" | ")}`);

const dupDescs = descs.filter((d, i) => descs.indexOf(d) !== i);
check("no two calculators share a description", dupDescs.length === 0, `duplicated: ${[...new Set(dupDescs)].join(" | ")}`);

/*
  Titles lead with the thing being searched for, not the brand. Someone typing
  "gratuity calculator" is not looking for us, and a title that opens with the
  product name spends the most valuable characters on the least useful word.
*/
for (const t of titles) {
  check(`"${t.slice(0, 40)}…" does not open with the brand`,
    !/^MNB Cortex/i.test(t),
    "the first words are what a searcher scans; the brand belongs at the end");
}

/* Google truncates around 60 for titles and 160 for descriptions. Over that is
   not an error, but it means the end of the sentence is never read. */
for (const t of titles) {
  check(`title is not absurdly long: "${t.slice(0, 30)}…"`, t.length <= 110, `${t.length} chars`);
}
for (const d of descs) {
  check(`description is a usable length: "${d.slice(0, 30)}…"`, d.length >= 80 && d.length <= 320, `${d.length} chars`);
}

/* No calculator may advertise a trial. Same rule as test-positioning; repeated
   here because this copy is written in a different file by a different mood. */
for (const d of [...titles, ...descs]) {
  check("no free-trial claim in calculator copy", !/free trial|try it free/i.test(d), d.slice(0, 60));
}

/* ------------------------------------------------------------- sitemap --- */

check("the sitemap is derived from the calculator list, not retyped",
  /CALCULATOR_ROUTES/.test(siteSrc),
  "a hand-maintained second list is exactly how all 29 came to be missing from it");

check("the sitemap gives calculators a real priority",
  /CALCULATOR_ROUTES\.map\(\(r\) => entry\(r, 0\.[6-9]/.test(siteSrc),
  "everything at one priority tells a crawler nothing about what this site is for");

/* ------------------------------------------------------------------ report */
console.log(`\ncalculator SEO: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log(`  ${navRoutes.length} calculators, each with its own title, description, canonical and sitemap entry.`);
