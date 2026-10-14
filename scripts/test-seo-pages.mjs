/*
  THE PROGRAMMATIC SEO SURFACE — 27 industries, 13 deadline topics.

  Run with:  npm run test:seo-pages

  WHY THIS EXISTS

  Both page sets are generated from an array. That is the whole point — adding
  an industry should add a page, a title, a description and a sitemap entry
  with no second edit — and it is also the failure mode: a generator quietly
  producing 27 pages with the same <title>, or a sitemap that lists a route the
  router does not serve, looks completely fine in review and is worthless or
  worse in a crawl.

  Duplicate titles across a programmatic set are the specific way this goes
  wrong. Google treats near-identical pages as one, so 27 pages sharing a title
  earn the ranking of about one page while spending the crawl budget of 27.

  WHAT IS CHECKED

    every industry and every deadline topic resolves to a page
    every title and description is unique, present, and a sane length
    the sitemap lists exactly the routes that exist — no orphans, no 404s
    no deadline page hardcodes a date; they all read statutory.ts
    the deadline topics between them cover every rule in the catalogue
    `appliesIf` is rendered, because the source module insists on it
*/

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const { INDUSTRIES } = await import("../src/lib/industries.ts");
const { industrySeo, INDUSTRY_SLUGS } = await import("../src/lib/industry-seo.ts");
const { DEADLINE_TOPICS, DEADLINE_SLUGS, rulesFor, whenText, getDeadlineTopic } =
  await import("../src/lib/deadline-seo.ts");
const { STATUTORY_CATALOGUE, nextOccurrence, statutoryRule } = await import("../src/lib/statutory.ts");

/* ============================================================ industries === */
{
  check(INDUSTRIES.length >= 20, "there are industries to build from", String(INDUSTRIES.length));
  check(INDUSTRY_SLUGS.length === INDUSTRIES.length, "every industry has a slug");

  const titles = new Set(), descs = new Set();
  for (const i of INDUSTRIES) {
    const seo = industrySeo(i.slug);
    check(!!seo, `industrySeo("${i.slug}") resolves`);
    if (!seo) continue;

    check(seo.title.length > 25 && seo.title.length < 130, `${i.slug}: title is a sane length`, `${seo.title.length}`);
    check(seo.description.length > 70 && seo.description.length < 320, `${i.slug}: description is a sane length`, `${seo.description.length}`);
    check(seo.title.includes(i.name), `${i.slug}: title names the industry`);

    /* THE ONE THAT MATTERS. */
    check(!titles.has(seo.title), `${i.slug}: title is unique across the set`, seo.title);
    check(!descs.has(seo.description), `${i.slug}: description is unique across the set`);
    titles.add(seo.title); descs.add(seo.description);

    /* Every fix links somewhere real-looking; a dead internal link on 27 pages
       is 27 crawl dead-ends. */
    for (const f of i.fixes) {
      check(typeof f.href === "string" && f.href.startsWith("/"), `${i.slug}: fix "${f.tool}" has an internal href`, String(f.href));
    }
    check(i.pains.length >= 2, `${i.slug}: has enough distinct pains to justify a page`, String(i.pains.length));
  }
  check(industrySeo("not-a-real-industry") === null, "an unknown slug resolves to null, not a blank page");
}

/* ============================================================= deadlines === */
{
  check(DEADLINE_TOPICS.length >= 10, "there are deadline topics", String(DEADLINE_TOPICS.length));

  const titles = new Set(), descs = new Set(), slugs = new Set();
  for (const t of DEADLINE_TOPICS) {
    check(!slugs.has(t.slug), `slug "${t.slug}" is unique`); slugs.add(t.slug);
    check(/^[a-z0-9-]+$/.test(t.slug), `slug "${t.slug}" is url-safe`);
    check(!titles.has(t.title), `${t.slug}: title is unique`, t.title); titles.add(t.title);
    check(!descs.has(t.description), `${t.slug}: description is unique`); descs.add(t.description);
    check(t.title.length > 25 && t.title.length < 130, `${t.slug}: title length`, String(t.title.length));
    check(t.description.length > 70 && t.description.length < 320, `${t.slug}: description length`, String(t.description.length));

    const rules = rulesFor(t);
    check(rules.length > 0, `${t.slug}: resolves to at least one real statutory rule`);
    for (const r of rules) {
      check(!!statutoryRule(r.id), `${t.slug}: rule "${r.id}" exists in the catalogue`);
      check(typeof r.appliesIf === "string" && r.appliesIf.length > 5,
        `${t.slug}: rule "${r.id}" carries an appliesIf`,
        "statutory.ts requires every warning to say who it applies to");
      check(whenText(r).length > 3, `${t.slug}: whenText renders for "${r.id}"`, whenText(r));
    }
  }

  /* EVERY rule must be reachable from some page, or we have written data we
     never publish — and a rule that exists but has no page is invisible in
     exactly the way this whole exercise is meant to fix. */
  const covered = new Set(DEADLINE_TOPICS.flatMap((t) => t.ids));
  /*
    Rules added for CAL-1/CAL-2/CAL-3 (quarterly QRMP returns, GSTR-6 split out
    of IFF, CMP-08, GSTR-4, GSTR-9, MSME-1, the 30 April TDS date). They are
    listed on the /deadlines hub, which renders the whole catalogue, but their
    topic pages live in src/lib/deadline-seo.ts, which another change owns.
    Named here, one by one, so the gap is visible rather than the check being
    loosened — and the second loop fails if one gets a page and stays listed.
  */
  const AWAITING_TOPIC = new Set([]);
  for (const r of STATUTORY_CATALOGUE) {
    if (AWAITING_TOPIC.has(r.id) && !covered.has(r.id)) {
      check(true, `statutory rule "${r.id}" awaits a topic page (listed on the hub)`);
      continue;
    }
    check(covered.has(r.id), `statutory rule "${r.id}" (${r.name}) is covered by a page`);
  }
  for (const id of AWAITING_TOPIC) {
    check(!covered.has(id), `"${id}" now has a topic page — remove it from AWAITING_TOPIC`);
    check(!!statutoryRule(id), `"${id}" in AWAITING_TOPIC is a real rule`);
  }
  check(getDeadlineTopic("nope") === null, "an unknown deadline slug resolves to null");

  /* Follow-ups: whenText prefers whenLabel, and the PMT-06 page no longer says the payment "stays monthly". */
  const pmt = statutoryRule("pmt06");
  check(pmt && whenText(pmt) === pmt.whenLabel, "whenText() returns the rule's whenLabel first (PMT-06)", pmt && whenText(pmt));
  const q3b = statutoryRule("gstr3b-qrmp");
  check(q3b && /22nd or 24th/.test(whenText(q3b)), "whenText(GSTR-3B quarterly) says 22nd or 24th, not one day", q3b && whenText(q3b));
  const pmtTopic = DEADLINE_TOPICS.find((t) => t.ids.includes("pmt06"));
  const pmtText = pmtTopic ? [pmtTopic.title, pmtTopic.description, pmtTopic.standfirst].join(" ") : "";
  check(pmtTopic && !/stays monthly|pay monthly/i.test(pmtText) && /first two months/i.test(pmtText),
    "PMT-06 page: only months 1 and 2 of a quarter, never 'stays monthly'", pmtText);
  const g9 = DEADLINE_TOPICS.find((t) => t.ids.includes("gstr9"));
  check(g9 && /year by year/i.test(g9.standfirst) && /₹2 crore/.test(g9.standfirst), "GSTR-9 page says the ₹2 crore exemption is renewed year by year");
  const q3bTopic = DEADLINE_TOPICS.find((t) => t.ids.includes("gstr3b-qrmp"));
  check(q3bTopic && /state/i.test(q3bTopic.standfirst), "GSTR-3B quarterly page says the day depends on the state");
}

/* ------ whenText and nextOccurrence agree with the rule they describe ----- */
{
  for (const r of STATUTORY_CATALOGUE) {
    const t = whenText(r);
    check(t.includes(String(r.day)), `whenText("${r.id}") contains the real day ${r.day}`, t);
    /* What the pages actually print: whenLabel first, then whenText. A rule that
       only falls due in some months (PMT-06, IFF, the QRMP returns) must never
       read "every month" — on 14 Oct 2026 that promised a PMT-06 on 25 Oct. */
    const shown = r.whenLabel ?? t;
    if (r.cadence === "monthly" && !r.months) check(/every month/.test(shown), `"${r.id}" reads as monthly`, shown);
    if (r.months) check(!/every month/.test(shown), `"${r.id}" does not claim to be due every month`, shown);

    const next = nextOccurrence(r.id, new Date("2026-06-10T12:00:00+05:30"));
    check(next instanceof Date && !isNaN(next.getTime()), `nextOccurrence("${r.id}") returns a date`);
    if (next) {
      const istDay = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit" }).format(next));
      check(istDay === r.day, `nextOccurrence("${r.id}") lands on day ${r.day} in IST`, String(istDay));
      check(next.getTime() >= new Date("2026-06-10T00:00:00+05:30").getTime(),
        `nextOccurrence("${r.id}") is never in the past`);
    }
  }
  check(nextOccurrence("not-a-rule") === null, "nextOccurrence on an unknown id is null");
}

/* ====================== the pages must not restate what the data says ==== */
{
  /*
    A hardcoded date in the JSX is the failure this whole structure exists to
    prevent: the product would warn on one day and the public page would
    advertise another, and only the page would be wrong.

    Looks for a day-of-month written as a literal ordinal in the page files.
  */
  for (const f of ["src/app/deadlines/page.tsx", "src/app/deadlines/[slug]/page.tsx"]) {
    const live = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const ordinals = live.match(/\b\d{1,2}(st|nd|rd|th)\b/g) || [];
    check(ordinals.length === 0, `${f} hardcodes no ordinal date`, ordinals.join(", "));
    check(/whenText\(/.test(live), `${f} renders dates through whenText()`);
    check(/r\.whenLabel \?\? whenText\(r\)/.test(live), `${f} prefers the rule's whenLabel over whenText()`);
  }

  /* appliesIf has to actually reach the screen on the detail page. */
  const detail = read("src/app/deadlines/[slug]/page.tsx");
  check(/\{r\.appliesIf\}/.test(detail), "the deadline page renders appliesIf");
  check(/Applies if/i.test(detail), "the deadline page labels it for the reader");
}

/* ================================= sitemap lists exactly what exists ===== */
{
  const sm = read("src/app/sitemap.ts");
  check(/INDUSTRY_SLUGS/.test(sm), "the sitemap derives industry routes from the data");
  check(/DEADLINE_SLUGS/.test(sm), "the sitemap derives deadline routes from the data");
  check(/"\/deadlines"/.test(sm), "the sitemap lists the deadlines hub itself");

  /* No hand-typed duplicates of a generated route — that is how the two lists
     drift and one of them starts 404ing. */
  for (const s of [...INDUSTRY_SLUGS, ...DEADLINE_SLUGS]) {
    check(!sm.includes(`"/industries/${s}"`) && !sm.includes(`"/deadlines/${s}"`),
      `the sitemap does not hand-list "${s}" as well as deriving it`);
  }
}

/* ================================== the hub links every generated page === */
{
  const hub = read("src/app/industries/page.tsx");
  check(/href=\{`\/industries\/\$\{i\.slug\}`\}/.test(hub),
    "the industries hub links each industry to its own page",
    "without this the 27 pages are reachable only from the sitemap");
  check(!/href=\{`#\$\{i\.slug\}`\}/.test(hub), "the hub no longer uses in-page anchors instead of real links");

  const dhub = read("src/app/deadlines/page.tsx");
  check(/DEADLINE_TOPICS.map/.test(dhub), "the deadlines hub lists every topic");
  check(/STATUTORY_CATALOGUE.length/.test(dhub),
    "the hub's count is derived, not typed",
    "a typed count here is the easiest place for a stale number to reappear");
}

console.log(`\nSEO pages: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(1);
}
console.log(`  ${INDUSTRIES.length} industry pages and ${DEADLINE_TOPICS.length} deadline pages, all unique, all derived, all in the sitemap.`);
