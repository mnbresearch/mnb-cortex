/*
  THE 2026-10 PREMIUM REPRICE — and the three capabilities only the top plans get.

    1. Prices and allowances: every plan sells a credit at or above the ₹0.90
       floor; Try is never a cheaper way to buy credits than Watch; every pack
       costs more per credit than any plan; bullets state the real allowance.
    2. Capabilities: api_write only Practice/Command/Enterprise (+ retired tiers
       that already had it); autonomy only Command/Enterprise (+ AI COO).
       Watch Pro gets neither. The upgrade prompt names the right plan.
    3. Enforcement where it matters (server side, before the write):
       generateApiKey refuses ingest:write; savePolicy / acceptAutonomy refuse
       a high-impact "auto" rule; the nightly watch drafts 5 or 15 reminders.
    4. No stale price left in customer-facing copy.

  Run: node --experimental-strip-types --no-warnings scripts/test-premium-tiers.mjs
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(join(root, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const C = await import("../src/lib/config.ts");
const plan = (id) => C.PLANS.find((p) => p.id === id);

/* 1. prices */
{
  const want = { try: [1499, 14990], watch: [7999, 79990], watchpro: [19999, 199990], practice: [39999, 399990], command: [59999, 599990] };
  for (const [id, [m, y]] of Object.entries(want)) check(plan(id)?.monthly === m && plan(id)?.annual === y, `price: ${id} is ₹${m}/mo, ₹${y}/yr`);
  const worst = (p) => (p.annual / 12) / C.PLAN_CREDITS[p.id];
  for (const p of C.PLANS.filter((x) => x.monthly > 0)) check(worst(p) >= 0.9, `floor: ${p.id} sells a credit at ₹${worst(p).toFixed(3)} ≥ ₹0.90`);
  check(worst(plan("try")) >= worst(plan("watch")), "Try is never a cheaper way to buy credits than Watch");
  const maxPlanRate = Math.max(...C.PLANS.filter((x) => x.monthly > 0).map((p) => p.monthly / C.PLAN_CREDITS[p.id]));
  for (const k of C.PUBLIC_CREDIT_PACKS) check(k.price / k.credits > maxPlanRate, `packs: ${k.label} (₹${(k.price / k.credits).toFixed(2)}/credit) costs more per credit than any plan`);
  for (const k of C.PUBLIC_CREDIT_PACKS) check(k.per === `₹${(k.price / k.credits).toFixed(2)} / credit`, `packs: ${k.label}'s label states its real rate`);
  for (const p of C.PLANS.filter((x) => C.PLAN_CREDITS[x.id] > 0 && x.id !== "enterprise")) {
    const shown = C.PLAN_CREDITS[p.id].toLocaleString("en-IN");
    check(p.features.some((f) => f.startsWith(`${shown} AI credits`)), `bullets: ${p.id} states its real allowance (${shown})`);
  }
  check(C.ANNUAL_SAVING_PCT === 16, "annual saving is still derived and honest (ten months for twelve = 16%)");
  check(C.ENTRY_PRICE_LABEL === "₹1,499" && C.TOP_SELF_SERVE_PRICE_LABEL === "₹59,999" && C.SMALLEST_PACK_LABEL === "₹249", "copy labels derive from the catalogue");
  check(C.PLAN_SEATS.watch === 5 && plan("watch").features[0].includes("up to 5 users"), "Watch: 5 seats, enforced and stated");
}

/* 2. capabilities */
{
  const has = (p, c) => C.planIncludes(p, c);
  check(!has("try", "api_write") && !has("watch", "api_write") && !has("watchpro", "api_write") && has("practice", "api_write") && has("command", "api_write") && has("enterprise", "api_write"),
    "api_write: Practice, Command, Enterprise only");
  check(!has("watchpro", "autonomy") && !has("practice", "autonomy") && has("command", "autonomy") && has("enterprise", "autonomy"), "autonomy: Command and Enterprise only");
  check(has("watchpro", "api"), "Watch Pro keeps the read API");
  check(has("aicoo", "autonomy") && has("business", "api_write") && has("premium", "api_write"), "retired tiers keep what they were already able to do");
  check(C.lowestPlanWith("api_write") === "Practice" && C.lowestPlanWith("autonomy") === "Command", "the upgrade prompt names the right plan");
  check(C.watchRemindersFor("watch") === 5 && C.watchRemindersFor("watchpro") === 5 && C.watchRemindersFor("practice") === 15 && C.watchRemindersFor("command") === 15 && C.watchRemindersFor("") === 5,
    "nightly watch: 5 reminders, 15 on Practice and Command");
  const autopilot = C.PLANS.filter((p) => p.features.some((f) => /^Autopilot/.test(f))).map((p) => p.id);
  const twoWay = C.PLANS.filter((p) => p.features.some((f) => /^Two-way API/.test(f))).map((p) => p.id);
  check(autopilot.join() === "command", "bullets: Autopilot is sold only where it is enforced", autopilot.join());
  check(twoWay.join() === "practice,command", "bullets: two-way API is sold only where it is enforced", twoWay.join());
  check(plan("watchpro").features.some((f) => /^Read API/.test(f)) && !plan("watchpro").features.some((f) => /Public API \+ outbound/.test(f)), "bullets: Watch Pro says READ API, not a two-way one");
}

/* 3. enforcement */
{
  const acts = read("src/lib/actions.ts");
  const gen = acts.slice(acts.indexOf("export async function generateApiKey"), acts.indexOf("export async function rotateApiKey"));
  check(/scopes\.includes\("ingest:write"\) && !planIncludes\(plan, "api_write"\)/.test(gen) && gen.indexOf('"api_write"') < gen.indexOf('svc.from("api_keys").insert'),
    "api key: ingest:write refused below Practice, before anything is written");
  const sa = read("src/lib/engine/server-actions.ts");
  const fn = (n) => { const i = sa.indexOf(`export async function ${n}`); const j = sa.indexOf("\nexport ", i + 10); return sa.slice(i, j); };
  for (const n of ["savePolicy", "acceptAutonomy"]) {
    const b = fn(n);
    check(/const gate = await autonomyGate\(orgId\);\s*if \(gate\) return fail\(gate\);/.test(b) && b.indexOf("autonomyGate") < b.indexOf("ledger.setPolicy"), `autopilot: ${n} refuses a high-impact auto rule below Command, before the rule is saved`);
  }
  check(/planIncludes\(String\(\(data as any\)\?\.plan \|\| ""\), "autonomy"\)/.test(sa), "autopilot: the gate reads the workspace's own plan");
  const W = await import("../src/lib/watch-plan.ts");
  const inv = Array.from({ length: 30 }, (_, k) => ({ id: "i" + k, invoice_no: "INV-" + k, party: "P" + k, amount: 10_000 + k, due_date: "2026-08-01", status: "pending", type: "receivable" }));
  const base = { orgId: "o", today: "2026-10-13", invoices: inv, doNotContact: [], collectionsOn: false, recentlyReminded: [], msme: [], deals: [], quotes: [], normalise: (s) => (s ? String(s).toLowerCase() : null) };
  const n = (x) => W.planWatch(x).filter((p) => p.action === "send_payment_reminder").length;
  check(n(base) === 5 && n({ ...base, maxReminders: 15 }) === 15 && n({ ...base, maxReminders: 999 }) === 30 - 0 - 0 && true, "watch: 5 by default, 15 when the plan allows", `${n(base)} / ${n({ ...base, maxReminders: 15 })}`);
  check(n({ ...base, maxReminders: 999 }) <= 50, "watch: a nonsense cap is clamped");
  check(/maxReminders: watchRemindersFor\(orgPlan\)/.test(read("src/lib/watch.ts")), "watch: the runner passes the workspace's plan allowance");
  const dev = read("src/app/(app)/developers/page.tsx");
  check(/canWrite = planIncludes\(billing\.plan, "api_write"\)/.test(dev) && /s === "ingest:write" \? \(canWrite \? null : writePlan\)/.test(read("src/components/api-key-creator.tsx")) && /disabled=\{Boolean\(lockedFor\(s\)\)\}/.test(read("src/components/api-key-creator.tsx")), "UI: the write scope is shown as a higher-tier option, and the server still decides");
}

/* 4. no stale price in what customers read */
{
  const files = [];
  const walk = (d) => { for (const e of readdirSync(join(root, d))) { const p = join(d, e); statSync(join(root, p)).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(e) && files.push(p); } };
  walk("src/app"); walk("src/components"); files.push("src/lib/lifecycle.ts", "src/lib/config.ts", "src/lib/api-guard.ts");
  const stale = [];
  for (const f of files) {
    const code = strip(read(f));
    if (/₹ ?799\b|₹ ?149\b|from ₹4,999|₹39,999 a month/.test(code)) stale.push(f);
  }
  check(stale.length === 0, "copy: no ₹799 / ₹149 / old ladder left in customer-facing strings", stale.join(", "));
  check(/\$\{ENTRY_PRICE_LABEL\}/.test(read("src/lib/lifecycle.ts")) && /ENTRY_PRICE_LABEL/.test(read("src/app/page.tsx")) && /ENTRY_PRICE_LABEL/.test(read("src/app/pricing/page.tsx")), "copy: 'from ₹X' reads the catalogue, so the next reprice cannot go stale");
  check(/₹59,999\/month or ₹5,99,990\/year · 55,000 AI credits/.test(read("src/app/terms/page.tsx")), "terms: the contract names the new prices");
}

console.log(`\npremium-tiers: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
