/*
  THE FEATURE ATLAS — what /discover, /features and the dashboard card say
  Cortex can do must be true, findable, and correctly gated.

    1. Every entry opens a real page (lib/nav.ts) and ids are unique.
    2. Every "used recently" signal is a mode that is really charged somewhere
       in src/ — so the badge can only be true.
    3. Plan gating comes from config.ts and matches the price list.
    4. Suggestions: only included, only with a usage signal, never one already used.
    5. Copy says what it does, not what it might earn you.
    6. Wiring: /discover is in the sidebar; dashboard and /features show it;
       the usage wording never claims "never used".

  Run: node --experimental-strip-types --no-warnings scripts/test-feature-atlas.mjs
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");

const A = await import("../src/lib/feature-atlas.ts");
const C = await import("../src/lib/config.ts");
const NAV = new Set([...read("src/lib/nav.ts").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]));

/* 1 */
const ids = A.FEATURES.map((f) => f.id);
check(new Set(ids).size === ids.length, "feature ids are unique");
check(A.FEATURES.length >= 35, `a real atlas (${A.FEATURES.length} entries)`);
for (const f of A.FEATURES) check(NAV.has(f.route), `${f.id}: ${f.route} is a real page`);
for (const j of A.JOBS) check(A.FEATURES.filter((f) => f.job === j.id).length >= 3, `job "${j.label}" has at least three things in it`);

/* 2 — every mode is charged somewhere real */
const src = [];
const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e) && src.push(read(p)); } };
walk("src/app"); walk("src/components"); walk("src/lib");
const all = src.join("\n");
for (const f of A.FEATURES) for (const m of f.modes) {
  check(m in C.CREDIT_COSTS, `${f.id}: mode "${m}" is a metered mode`);
  const charged = new RegExp(`chargeForMode\\("${m}"\\)|chargeOrgForMode\\([^)]*"${m}"|mode="${m}"|mode: "${m}"`).test(all);
  check(charged, `${f.id}: mode "${m}" is actually charged by a page or route, so "used recently" can be true`);
}

/* 3 — gating */
const g = (id, plan) => A.gateInfo(A.FEATURES.find((f) => f.id === id), plan);
check(g("receivables", "try").included && g("receivables", "try").label === "Every plan", "core features are on every plan");
check(!g("workflows", "watch").included && g("workflows", "watchpro").included && g("workflows", "watch").label === `${C.lowestPlanWith("workflows")} and above`, "workflows: Watch Pro and above, label from config");
check(!g("autopilot", "practice").included && g("autopilot", "command").included && /Command/.test(g("autopilot", "watch").label), "Autopilot: Command only");
check(!g("agent-images", "watch").included && g("agent-images", "watchpro").included, "images and video follow IMAGE_WEEKLY");
check(!g("practice", "command").included && g("practice", "practice").included, "Practice console: the Practice plan");
check(!g("receivables", null).included, "a visitor is never told something is 'in your plan'");

/* 4 — suggestions */
const inc = (plan) => (f) => A.gateInfo(f, plan).included;
const s1 = A.suggestFor({ included: inc("watch"), usedModes: new Set(), limit: 50 });
check(s1.every((f) => f.modes.length > 0), "only features with a usage signal are suggested");
check(s1.every((f) => A.gateInfo(f, "watch").included), "never suggests something the plan does not include");
const used = new Set(["chat", "ask", "gst"]);
const s2 = A.suggestFor({ included: inc("watch"), usedModes: used, limit: 50 });
check(!s2.some((f) => f.modes.some((m) => used.has(m))), "never suggests something used recently");
check(A.suggestFor({ included: inc("watch"), usedModes: new Set(), limit: 3 }).length === 3, "limit respected");

/* 5 — copy */
for (const f of A.FEATURES) {
  check(f.outcome.length <= 140, `${f.id}: outcome fits a card (${f.outcome.length})`);
  check(!/guarantee|\d+\s?%|increase (your )?revenue|save \d+ hours|10x|never miss a payment/i.test(f.outcome), `${f.id}: no outcome promise the product cannot back`, f.outcome);
}
check(A.matches(A.FEATURES.find((f) => f.id === "msme"), "43b") && A.matches(A.FEATURES.find((f) => f.id === "collections"), "whatsapp") && !A.matches(A.FEATURES.find((f) => f.id === "msme"), "zzzz"), "search finds by keyword");

/* 6 — wiring */
check(NAV.has("/discover"), "/discover is in the sidebar");
const disc = read("src/app/(app)/discover/page.tsx");
check(/usedModes\(orgId\)/.test(disc) && /counted since October 2026/.test(disc) && !/never used|haven't used/i.test(disc), "/discover reads real usage and says how far back it counts");
const usage = read("src/lib/feature-usage.ts");
check(/\.eq\("event", "feature_used"\)/.test(usage) && /\.eq\("org_id", orgId\)/.test(usage), "usage is this workspace's own feature_used events");
check(/tryNext/.test(read("src/app/(app)/dashboard/page.tsx")) && /href="\/discover"/.test(read("src/app/(app)/dashboard/page.tsx")), "dashboard suggests three and links to the full list");
check(/<FeatureAtlas variant="public"/.test(read("src/app/features/page.tsx")), "/features carries the searchable atlas");
check(/variant === "public" \? `\/login\?mode=signup&next=/.test(read("src/components/feature-atlas.tsx")), "public links go through sign-up to the feature");

console.log(`\nfeature-atlas: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
