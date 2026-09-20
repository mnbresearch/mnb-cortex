/*
  EVERY NUMBER WE PUBLISH, CHECKED AGAINST THE THING IT COUNTS.

  Run with:  npm run test:claims

  WHY

  A claim-to-implementation audit found seventeen drifted claims across the
  marketing pages, and the largest group by count was numbers that had simply
  stopped being true: "130 modules" against 128 nav entries, "Image agents
  (80)" against 98. Individually trivial. Collectively they undermine a product
  whose entire pitch is that it tells you the truth about your own figures —
  and whose README says the sources of truth are checkable.

  These are also the cheapest possible thing to get wrong: someone adds a nav
  entry, and a number on the homepage silently becomes false. Nobody is going
  to remember. So it fails here instead.

  WHAT THIS DELIBERATELY DOES NOT DO

  It does not check prose. "Runs a nightly sweep" versus "briefs you each
  morning" is a judgement about what the architecture supports, and encoding
  judgements as string matches produces a test that fails on rewording and
  passes on lies. This checks the falsifiable part: integers, and a short list
  of phrases that were each removed for a stated reason and must not come back.
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

/* ---- the sources of truth, loaded from the real modules ---------------- */
const { NAV } = await import("../src/lib/nav.ts");
const cat = await import("../src/lib/agents/catalog.ts");
const { INDUSTRIES } = await import("../src/lib/industries.ts");
const { CALCULATOR_ROUTES } = await import("../src/lib/calculator-seo.ts");

const TRUE = {
  modules: NAV.length,
  calculators: NAV.filter((n) => n.calc).length,
  agents: cat.agentCount(),
  reasoning: (cat.AGENTS || []).filter((a) => a.kind === "reasoning").length,
  image: (cat.AGENTS || []).filter((a) => a.kind === "image").length,
  industries: INDUSTRIES.length,
};

check(TRUE.modules > 0 && TRUE.agents > 0, "sources of truth loaded",
  JSON.stringify(TRUE));

/* The SEO surface and the nav must agree about what a calculator is — they are
   two lists of the same thing and were built at different times. */
check(CALCULATOR_ROUTES.length === TRUE.calculators,
  "the calculator SEO map and the nav agree",
  `seo=${CALCULATOR_ROUTES.length} nav=${TRUE.calculators}`);

/* ---- where each number is published ------------------------------------ */
const SURFACES = [
  "src/app/page.tsx",
  "src/app/features/page.tsx",
  "src/app/investors/page.tsx",
  "src/app/pricing/page.tsx",
  "README.md",
  "SETUP.md",
];

/*
  Each entry: a regex with ONE capture group holding the published integer, and
  the true value it must equal. The regex is deliberately narrow — it has to
  match the sentence we mean and not stray numbers that happen to be nearby.
*/
const PUBLISHED = [
  [/(\d+)\s+module(?:s| pages)\b/gi, TRUE.modules, "module count"],
  [/(\d+)\s+point tools\b/gi, TRUE.modules, "point-tools count"],
  [/(\d+)\s+Business Calculators\b/gi, TRUE.calculators, "calculator count"],
  [/(\d+)\s+calculators\b/gi, TRUE.calculators, "calculator count"],
  [/(\d+)\s+(?:AI )?agent(?:s| definitions)\b/gi, TRUE.agents, "agent count"],
  [/(\d+)\s+runnable text agents\b/gi, TRUE.reasoning, "reasoning-agent count"],
  [/Image agents \((\d+)\)/gi, TRUE.image, "image-agent count"],
  [/(\d+)\s+Indian industries\b/gi, TRUE.industries, "industry count"],
];

let checked = 0;
for (const file of SURFACES) {
  let text;
  try { text = read(file); } catch { continue; }

  /* Comments in these files explain what a number USED to be ("WAS 130..."),
     and those references must not fail the test that made them historical. */
  const live = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  for (const [re, truth, label] of PUBLISHED) {
    for (const m of live.matchAll(re)) {
      checked++;
      check(Number(m[1]) === truth,
        `${file}: ${label} is current`,
        `published "${m[0].trim()}" but the source says ${truth}`);
    }
  }
}
check(checked >= 8, "several published numbers were actually found and checked", String(checked));

/* ---- claims removed for a reason, which must not return ---------------- */
/*
  Each of these was deleted deliberately, and the reason is recorded at the
  site. A test is the only thing that stops the next rewrite reintroducing
  them, because the reasons are not obvious from the copy alone.
*/
const BANNED = [
  [/This week it caught/i, "an unsubstantiated performance claim with a rupee figure (CPA 2019 / ASCI)"],
  [/10,?000\+?\s+businesses/i, "a 200x overstatement of the published customer count"],
  /*
    Scoped to the MONITORING claim, not the phrase. The refund policy says
    credits are "delivered digitally and in real time", which is true — they
    are debited before the model call. A ban broad enough to catch that is a
    ban that gets switched off.
  */
  [/(?:Reads|Monitors?|Watches)[^.]{0,80}in real ?-?time/i, "monitoring is a daily cron, not real time"],
  [/ChatGPT[^.]{0,40}Perplexity/i, "AI Visibility queries Gemini only"],
  [/62 tools/i, "four providers sync; the rest are a credential vault"],
  [/no sales call/i, "the health-check form requires a phone and promises to call"],
  [/Groq by default/i, "the provider chain is Gemini first (lib/ai/cortex providerChain)"],
  [/AI-COO software/i, "the product was repositioned off 'AI COO'"],
];

for (const file of [...SURFACES, "src/app/refund/page.tsx", "src/app/help/page.tsx", "src/app/ai-visibility/page.tsx", "src/app/compare/page.tsx"]) {
  let text;
  try { text = read(file); } catch { continue; }
  const live = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const [re, why] of BANNED) {
    check(!re.test(live), `${file}: does not reintroduce "${re.source}"`, why);
  }
}

/* ---- the "3 min to your first warning" claim has a dependency ---------- */
/*
  That number is only true because the import screen AWAITS the recompute and
  renders the finding in place. If the import stops doing that, the warning
  goes back to arriving by cron the next morning and the stat becomes a lie
  again — silently, since nothing else would change.
*/
{
  const actions = read("src/lib/actions.ts");
  const page = read("src/app/page.tsx");
  if (/first import to your first warning/.test(page)) {
    check(/recomputeAndReport/.test(actions),
      "the '3 min from import to warning' stat still has its mechanism",
      "page.tsx claims it but lib/actions.ts no longer calls recomputeAndReport");
    check(/warning:\s*topWarning\(/.test(actions),
      "the import still returns the warning it promises",
      "topWarning() is no longer attached to the import result");
  }
}

/* ---- the integration copy must not outrun lib/sync --------------------- */
{
  const sync = read("src/lib/sync/index.ts");
  const m = sync.match(/export const CONNECTORS[^=]*=\s*\[([^\]]*)\]/);
  check(!!m, "CONNECTORS is found in lib/sync");
  const live = m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  check(live.length === 4, "there are still exactly four live syncs", `found ${live.length}: ${live.join(", ")}`);

  /* The manager duplicates the list as a string array so a client component can
     read it. A copy that drifts would badge a non-syncing provider "Syncs". */
  const mgr = read("src/components/integrations-manager.tsx");
  const dup = mgr.match(/const SYNCABLE = \[([^\]]*)\]/);
  check(!!dup, "the component's SYNCABLE list is found");
  if (dup) {
    const ids = [...dup[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
    check(ids.length === live.length,
      "the UI's SYNCABLE list is the same length as lib/sync CONNECTORS",
      `ui=${ids.length} lib=${live.length}`);
    for (const id of ids) {
      check(new RegExp(`id:\\s*"${id}"`).test(sync) || new RegExp(`\\b${id.replace(/_(.)/g, (_, c) => c.toUpperCase())}\\b`).test(sync),
        `SYNCABLE's "${id}" corresponds to a real connector in lib/sync`);
    }
  }
}


/* ============ four findings from the populated-workspace review ========== */
/*
  Each of these was confirmed in the live UI. None is a crash, which is why the
  route sweep, the console and the server logs were all clean while the screens
  were wrong.
*/
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = (rel) => strip(readFileSync(join(ROOT, rel), "utf8"));

  /* A2 — the MSME table headed "Unpaid" over total_amount, which since the
     over-count fix holds ONLY past-window bills. A supplier with a live open
     bill read zero. */
  const msme = src("src/app/(app)/msme/page.tsx");
  check(!/>Unpaid<\/th>/.test(msme),
    "the MSME table no longer labels aged exposure as \"Unpaid\"",
    "Aarti Fasteners read Rs 0 with an unpaid Rs 2,52,000 bill on /finance");
  check(/Unpaid total/.test(msme) && /Past window/.test(msme),
    "it shows total unpaid and past-window exposure as separate columns");
  check(/r\.total_amount \+ r\.other_amount/.test(msme),
    "the unpaid total adds the bills still inside the window back in",
    "total_amount alone hid Rs 6.93 L of unpaid payables");

  /* A3 — churn labelled the same figure /rfm calls per-year as per-month. */
  const churn = src("src/components/churn-predictor.tsx");
  check(!/₹\/mo/.test(churn), "churn no longer labels the column per month");
  check(/₹\/yr/.test(churn), "…it matches the per-year label /rfm uses");
  check(!/\/mo at high risk/.test(churn),
    "and the revenue-at-risk badge is not per month either",
    "it overstated revenue at risk by up to twelve times");

  /* A5 — the KPI counted non-lost orders and called them orders. */
  const metrics = src("src/lib/metrics.ts");
  check(/label: "Open \+ won orders \(MTD\)"/.test(metrics),
    "the orders KPI names the population it counts, positively",
    "62 on the dashboard against 64 on /sales, with no definition on either");

  /* A6 — invented drivers under a live-grounding claim. */
  const forecast = src("src/app/(app)/forecast/page.tsx");
  for (const ghost of ["Premium-X", "RM-204", "West region", "₹72 L"]) {
    check(!forecast.includes(ghost),
      `/forecast no longer names "${ghost}" as a driver of the customer's forecast`,
      "none of it exists in the workspace; real overdue is Rs 2.54 Cr, not Rs 72 L");
  }
  check(!/grounded in your live numbers/.test(forecast),
    "…and the section no longer claims live grounding beside example figures");
  check(!/What's driving the forecast/.test(forecast),
    "the hardcoded driver section is deleted rather than relabelled",
    "an example lever is not a lever");
}


/* ================= one canonical date, printed in IST ==================== */
/*
  /plan said the 44AB audit report was due 29 September while /compliance said
  30 September — and the plan's own countdown, "in 13 days" from 17 September,
  resolved to the 30th. Both came from the same rule; only the formatting
  differed.

  lib/statutory.ts builds a due date at midnight IST, so toISOString() renders
  it in UTC as the previous evening and slicing gives the day before. data.ts
  did exactly that when handing deadlines to the model, which then repeated the
  wrong date into weekly plans. Every deadline in the AI context was a day
  early, on the one surface where a customer reads a date and acts on it.
*/
{
  const stat = readFileSync(join(ROOT, "src/lib/statutory.ts"), "utf8");
  const data = readFileSync(join(ROOT, "src/lib/data.ts"), "utf8");
  check(/export function istISO/.test(stat),
    "there is one canonical IST date formatter for deadlines");
  check(!/due\.toISOString\(\)/.test(data),
    "the AI context no longer formats a deadline with toISOString",
    "midnight IST renders as the previous day in UTC — every date was a day early");
  check(/istISO\(d\.due\)/.test(data),
    "…it uses istISO instead");
  const offenders = [];
  for (const f of ["src/lib/data.ts", "src/lib/weekly-update.ts", "src/lib/health.ts"]) {
    try {
      const t = readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      if (/\.due\.toISOString\(\)/.test(t)) offenders.push(f);
    } catch { /* file may not exist */ }
  }
  check(offenders.length === 0,
    "no surface prints a deadline date through toISOString",
    offenders.join(", "));
}

/* ===================== the brief does not claim to exist ================= */
{
  /* Comments stripped — brief-panel.tsx quotes the old "Freshly generated"
     string to explain why it went, and a check that cannot tell prose from
     code would forbid documenting the fix. Third time this trap has caught me
     today; it is now the default for every source assertion here. */
  const decomment = (t) => t.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
  const briefPage = decomment(readFileSync(join(ROOT, "src/app/(app)/brief/page.tsx"), "utf8"));
  const panel = decomment(readFileSync(join(ROOT, "src/components/brief-panel.tsx"), "utf8"));
  const emailer = decomment(readFileSync(join(ROOT, "src/components/brief-emailer.tsx"), "utf8"));

  check(!/Freshly generated/.test(briefPage) && !/Freshly generated/.test(panel),
    "/brief no longer claims a brief was freshly generated before one exists",
    "the page asserted a brief existed while asking the reader to create it");
  check(/Nothing generated yet today/.test(panel),
    "the empty state says plainly that nothing has been generated");
  check(/Generated at \$\{/.test(panel),
    "…and a generated brief carries the time it was built",
    "\"freshly\" is a claim about time that a static string can never honour");
  check(/onResult/.test(panel), "the panel learns when a result actually arrives");
  check(/does not email the one shown above/.test(emailer),
    "the emailer says it builds its own brief rather than sending the on-screen one",
    "/api/brief/email generates server-side, so it could send a different brief");
}

/* ========================================================================= */
/*  PLAYBOOKS — every one must point at a module that exists                 */
/* ========================================================================= */
/*
  A "templates" or "playbooks" section is the single most likely place for
  invented features to come back. It is written in the language of outcomes,
  it looks like copy rather than like a claim, and nobody checks whether the
  thing it describes is wired to anything — which is exactly how "10,000+
  businesses served", the ₹8.4L figure and the three written testimonials got
  onto this site in the first place.

  So the playbook list is generated from lib/playbooks.ts, and every entry
  there names the module that implements it. If a module is renamed or
  removed, the landing page stops describing it, here, before a customer ever
  reads the promise.
*/
{
  const { PLAYBOOKS } = await import("../src/lib/playbooks.ts");
  const routes = new Set(NAV.map((n) => n.href));

  check(PLAYBOOKS.length > 0, "playbooks are defined", String(PLAYBOOKS.length));

  const orphans = PLAYBOOKS.filter((p) => !routes.has(p.module));
  check(orphans.length === 0,
    `every playbook resolves to a real module (${PLAYBOOKS.length} checked)`,
    orphans.map((p) => `${p.id} → ${p.module}`).join(", "));

  /* Each one has to say what it watches AND what it does. A playbook that only
     watches is a dashboard tile, and the whole positioning rests on the
     difference. */
  const thin = PLAYBOOKS.filter((p) => !p.watches || !p.does || p.does.length < 30);
  check(thin.length === 0, "every playbook states both the trigger and the action",
    thin.map((p) => p.id).join(", "));

  /* The engine field is the honest part of "AI-native": statutory arithmetic
     must not quietly become a model call. */
  const statutory = PLAYBOOKS.filter((p) => ["msme-43bh", "statutory", "receivables"].includes(p.id));
  check(statutory.length === 3 && statutory.every((p) => p.engine === "rules"),
    "the statutory and ageing playbooks are decided by rules, not by a model",
    statutory.map((p) => `${p.id}:${p.engine}`).join(", "));

  /* The landing page and the investor page must both render the real list
     rather than a hand-typed copy of it. */
  const landing = read("src/app/page.tsx");
  const investors = read("src/app/investors/page.tsx");
  check(/PLAYBOOKS\.map/.test(landing), "the landing page renders the real playbook list");
  check(/PLAYBOOKS\.(map|length)/.test(investors), "the investor page does too");
  check(/PLAYBOOKS\.length/.test(landing),
    "…and counts them rather than printing a number",
    "a typed count is what drifted twice before");
}

/* ========================================================================= */
/*  THE INVESTOR PAGE MAY NOT GROW A TRACTION NUMBER                        */
/* ========================================================================= */
/*
  The investor page is the highest-temptation surface in the repository: it is
  read by people we want to impress, and nobody who reads it can check it
  against the database. It previously carried a KPI band of AbroBot figures
  presented under a Cortex heading.

  The rule is narrow and mechanical: no customer/revenue/ARR/MRR/GMV figure on
  that page until the product can reproduce it on demand. Product depth
  (modules, agents, industries) is fine — those are computed from the code by
  the page itself.
*/
{
  const investors = read("src/app/investors/page.tsx");
  const BANNED_METRICS = [
    [/\b\d[\d,]*\+?\s*(paying\s+)?(customers|businesses|workspaces|users|SMEs)\b/i,
     "a customer count"],
    [/(ARR|MRR|GMV)\b/i, "a revenue metric"],
    [/₹\s?\d[\d,.]*\s?(Cr|crore|L|lakh|K)\b.*\b(revenue|ARR|MRR|GMV|collected|recovered)\b/i,
     "a revenue figure"],
    [/\b\d+%\s*(growth|MoM|month-on-month|retention)\b/i, "a growth or retention rate"],
  ];
  for (const [re, what] of BANNED_METRICS) {
    check(!re.test(investors), `the investor page publishes no ${what}`,
      "put it here when the product can reproduce it on demand — see docs/positioning.md §9");
  }
  /* And it must keep saying so, so the omission reads as a choice. */
  check(/no revenue chart on this page/i.test(investors),
    "…and says out loud why there is no revenue chart",
    "an absent number with no explanation looks like an oversight rather than a standard");
}

console.log(`\nclaims: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(1);
}
console.log(`  ${checked} published numbers match their sources; ${BANNED.length} retired claims stay retired.`);
