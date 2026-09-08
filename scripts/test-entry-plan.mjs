/*
  The ₹799 entry tier, the prompt improver, and the workforce pulse.

  WHY EACH OF THESE IS ASSERTED

  1. THE ENTRY PLAN is the one place a pricing mistake is invisible. The
     per-credit rate is never shown on the pricing page, so a tier that
     undercuts the others looks identical to one that does not — right up until
     customers work out that ₹799 is the cheapest way to buy credits and
     downgrade. test-margins already proves no plan drops below the floor; this
     proves the narrower thing that matters commercially: the entry tier must
     not be BETTER value per credit than the tier above it.

  2. THE PROMPT IMPROVER must not write camera or lighting language.
     lib/ai/visual-prompts.ts adds that deterministically to every generation,
     and it is why the output stopped looking like stock footage. If the
     improver also produced it, each generation would carry two conflicting
     sets of instructions and the model would follow the wrong one — a
     regression that would show up as "the images got worse" with no error
     anywhere.

  3. THE PULSE must stay off for anyone who has asked for reduced motion, and
     must stay declarative. A requestAnimationFrame loop over ~130 nodes would
     compete with the pan and pinch handlers on exactly the mid-range Android
     phones this product is sold to.
*/
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); }
}

/** Comments removed, string literals KEPT — most checks here name something. */
function stripComments(src) {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c, start = i; i++;
      while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      out += src.slice(start, i); continue;
    }
    out += c; i++;
  }
  return out;
}
const read = (f) => stripComments(readFileSync(f, "utf8"));

/* ===================================================== 1. THE ₹799 PLAN ==== */

const config = read("src/lib/config.ts");

/* Parse the plans and allowances straight out of the source. */
const plans = [...config.matchAll(/\{ id: "(\w+)", name: "[^"]*", monthly: (\d+), annual: (\d+)/g)]
  .map((m) => ({ id: m[1], monthly: +m[2], annual: +m[3] }));
const creditsBlock = config.slice(config.indexOf("export const PLAN_CREDITS"));
const PLAN_CREDITS = {};
for (const m of creditsBlock.slice(0, creditsBlock.indexOf("};")).matchAll(/(\w+):\s*(-?\d+)/g)) {
  PLAN_CREDITS[m[1]] = +m[2];
}

const tryPlan = plans.find((p) => p.id === "try");
check("the ₹799 entry plan exists", Boolean(tryPlan));
check("it is priced at ₹799/month", tryPlan?.monthly === 799, `monthly is ${tryPlan?.monthly}`);

/*
  A real annual price, not zero. /api/pay/cashfree/order computes
  `annual ? plan.annual : plan.monthly` — a zero there creates a ₹0 order that
  Cashfree accepts and the webhook settles, granting a full paid period free.
*/
check("it has a non-zero annual price", (tryPlan?.annual || 0) > 0,
  "a zero annual price would create a ₹0 order the moment someone toggled annual billing");

const tryCredits = PLAN_CREDITS.try;
check("it has a credit allowance", tryCredits > 0, `PLAN_CREDITS.try is ${tryCredits}`);

/* The commercial property: worst-case rate, which for every plan is annual/12. */
const rate = (p) => (p.annual / 12) / PLAN_CREDITS[p.id];
const watch = plans.find((p) => p.id === "watch");

check(
  "the entry tier does NOT undercut Watch on price per credit",
  rate(tryPlan) >= rate(watch),
  `try is ₹${rate(tryPlan).toFixed(4)}/credit vs watch ₹${rate(watch).toFixed(4)} — a cheaper entry rate teaches paying customers to downgrade`,
);

check(
  "...and is not absurdly worse either, so it is still a fair trial",
  rate(tryPlan) <= rate(watch) * 1.15,
  `try is ₹${rate(tryPlan).toFixed(4)}/credit vs watch ₹${rate(watch).toFixed(4)}`,
);

/* It must be listed in every per-plan map, or a customer on it falls through
   to a default meant for someone else. */
for (const map of ["PLAN_SEATS", "IMAGE_WEEKLY", "VIDEO_WEEKLY", "PLAN_CAPABILITIES"]) {
  const blk = config.slice(config.indexOf(`export const ${map}`));
  check(`${map} covers the entry plan`, /\btry:/.test(blk.slice(0, blk.indexOf("};"))),
    `a plan missing from ${map} silently inherits another tier's entitlement`);
}

/* Video and image are premium actions; ₹799 must not include ₹77-a-clip Veo. */
const iw = config.slice(config.indexOf("export const IMAGE_WEEKLY"));
const vw = config.slice(config.indexOf("export const VIDEO_WEEKLY"));
check("the entry plan has no image quota", /\btry:\s*0/.test(iw.slice(0, iw.indexOf("};"))));
check("the entry plan has no video quota", /\btry:\s*0/.test(vw.slice(0, vw.indexOf("};"))));

/* The ₹0-order guard the entry plan exposed. */
const order = read("src/app/api/pay/cashfree/order/route.ts");
check(
  "no order can be created for a non-positive amount",
  /amount\s*<=\s*0/.test(order),
  "the plan branch guarded plan.monthly === 0 but not plan.annual",
);

/* ============================================ 2. THE PROMPT IMPROVER ==== */

const imp = read("src/lib/ai/improve-prompt.ts");

check("improveVisualBrief exists", /export async function improveVisualBrief/.test(imp));

/*
  THE DIVISION OF LABOUR. visual-prompts.ts owns HOW it is shot; the improver
  owns WHAT is shot. The system prompt must say so explicitly.
*/
for (const forbidden of ["camera", "lens", "lighting", "aspect ratio", "depth of field"]) {
  check(
    `the improver is told not to write "${forbidden}"`,
    new RegExp(forbidden, "i").test(imp) && /Do NOT mention camera/i.test(imp),
    "visual-prompts.ts adds this deterministically; a second set of instructions would conflict with it",
  );
}

check(
  "it refuses to invent brands, prices or claims about the business",
  /Do NOT invent a brand name/i.test(imp),
  "this text goes straight into an image the customer may publish",
);

check(
  "the cleaner is exported so it can be tested without a model call",
  /export function cleanImprovedBrief/.test(imp),
);

check(
  "output that is no longer than the original counts as no improvement",
  /t\.length <= String\(original/.test(imp),
  "otherwise the customer pays for a rewrite that gave them nothing",
);

/* The route must charge, and refund when it gives nothing back. */
const route = read("src/app/api/ai/improve-prompt/route.ts");
check("the route charges for the call", /chargeForMode\("improve_prompt"\)/.test(route));
check("...and refunds when there is no improvement",
  (route.match(/refundIfCharged\(gate, "improve_prompt"\)/g) || []).length >= 2,
  "needs a refund on both the empty-result branch and the catch");
/*
  Sliced from the handler, not the whole file. `chargeForMode` also appears in
  the import block at the top, so comparing indexOf() over the file compares the
  guard against an IMPORT STATEMENT and passes no matter where the guard
  actually sits. This is the fourth time that exact mistake has appeared in a
  test in this repo; it is why every ordering check now starts from the function.
*/
const routeBody = route.slice(route.indexOf("export async function POST"));
check("...and validates before charging",
  routeBody.indexOf("brief.length < 3") >= 0 &&
  routeBody.indexOf("brief.length < 3") < routeBody.indexOf("chargeForMode"),
  "charging first would bill for pressing the button on an empty box");
check("it declares a duration, so its own catch can run",
  /maxDuration = 60/.test(route),
  "a Vercel timeout kills the function rather than throwing, so refundIfCharged never fires");

const costs = config.slice(config.indexOf("export const CREDIT_COSTS"));
check("improve_prompt is metered", /improve_prompt:\s*\d+/.test(costs.slice(0, costs.indexOf("};"))));
const impCost = +(costs.match(/improve_prompt:\s*(\d+)/) || [])[1];
const imgCost = +(costs.match(/agent_image:\s*(\d+)/) || [])[1];
check("improving costs less than the image it improves", impCost > 0 && impCost < imgCost,
  `improve_prompt ${impCost} vs agent_image ${imgCost} — it must always be cheaper than generating twice`);

/* ================================================= 3. THE PULSE ========= */

const graph = read("src/components/workforce-graph.tsx");

check("the graph animates signals along its links", /repeatCount="indefinite"/.test(graph));
check(
  "the pulse is declarative SVG, not a per-frame JS loop",
  /<animate\s/.test(graph),
  "a requestAnimationFrame loop over ~130 nodes would fight the pan and pinch handlers",
);
check(
  "it honours prefers-reduced-motion",
  /prefers-reduced-motion/.test(graph) && /animate &&/.test(graph),
  "a network of this many moving dots is exactly what triggers vestibular symptoms",
);
check(
  "pulses are staggered deterministically, not randomly",
  /% 100/.test(graph) && !/Math\.random\(\)/.test(graph),
  "Math.random() would reshuffle the whole picture on every React re-render",
);
check(
  "the brain emits its own outward ring",
  /attributeName="r"/.test(graph),
  "so the centre reads as the source of the traffic rather than a bigger node",
);

/* ------------------------------------------------------------------ report */
console.log(`\nentry plan + prompt improver + pulse: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log(`  ₹799 sells credits at ₹${rate(tryPlan).toFixed(4)} vs Watch's ₹${rate(watch).toFixed(4)} — a smaller plan, not a cheaper one.`);
