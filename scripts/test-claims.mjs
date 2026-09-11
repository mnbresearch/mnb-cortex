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

console.log(`\nclaims: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(1);
}
console.log(`  ${checked} published numbers match their sources; ${BANNED.length} retired claims stay retired.`);
