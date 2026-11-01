/**
 * Group workspaces: a company linked to a live Enterprise group inherits the
 * group's plan for capabilities, seats and limits; nothing else does.
 */
import { readFileSync } from "node:fs";
const G = await import("../src/lib/engine/plan-gate.ts");
const C = await import("../src/lib/config.ts");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(n + (d ? `\n      ${d}` : "")));
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

const future = new Date(Date.now() + 30 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
const group = { id: "g1", plan: "enterprise", subscription_status: "active", subscription_ends_at: null };
const company = { id: "c1", plan: "watch", subscription_status: "trialing", trial_ends_at: past, practice_org_id: "g1" };

/* inheritance */
check(G.inheritedPlan(company, group) === "enterprise", "a linked company inherits the Enterprise group's plan");
check(G.capabilityPlan(company, group) === "enterprise", "capabilityPlan reads the group's plan");
for (const cap of ["api", "api_write", "autonomy", "workflows", "webhooks", "memory", "whitelabel", "alert_rules", "connectors"]) {
  check(G.capabilityVerdict(company, cap, group).ok, `company gets ${cap} from the group`);
}
check(C.seatLimit(G.capabilityPlan(company, group)) === -1, "company seats are the group's (unlimited), not the signup default 5");

/* nothing else inherits */
check(G.inheritedPlan(company, { ...group, plan: "practice" }) === null, "a Practice firm lends credits, not its plan");
check(!G.capabilityVerdict(company, "api", { ...group, plan: "practice" }).ok, "…so a CA firm's client does not get the API from the firm");
check(G.inheritedPlan({ ...company, practice_org_id: "other" }, group) === null, "not linked to THIS group → no inheritance");
check(G.inheritedPlan({ ...company, practice_org_id: null }, group) === null, "unlinked → no inheritance");
check(G.inheritedPlan({ ...group }, group) === null, "the group itself is not its own child");
check(G.inheritedPlan(company, null) === null, "no group row → own plan");

/* the group's state decides */
check(G.inheritedPlan(company, { ...group, subscription_status: "cancelled" }) === null, "a cancelled group stops lending its plan");
check(!G.capabilityVerdict(company, "api", { ...group, subscription_status: "cancelled" }).ok, "…and the company loses the API with it");
check(G.inheritedPlan(company, { ...group, subscription_status: "active", subscription_ends_at: past }) === null, "a lapsed group stops lending");
check(G.inheritedPlan(company, { ...group, subscription_status: "trialing", trial_ends_at: future }) === "enterprise", "a group on a live trial lends");

/* the company's own suspension wins */
check(G.capabilityVerdict({ ...company, subscription_status: "suspended" }, "api", group).reason === "suspended", "a suspended company is suspended, whatever the group");

/* unchanged behaviour for everyone else */
check(G.capabilityVerdict({ id: "x", plan: "command", subscription_status: "active" }, "autonomy").ok, "Command alone keeps Autopilot");
check(!G.capabilityVerdict({ id: "x", plan: "watch", subscription_status: "active" }, "api").ok, "Watch alone still has no API");
check(G.capabilityPlan({ id: "x", plan: "watchpro" }) === "watchpro", "no group → own plan");

/* wiring */
const acts = read("src/lib/actions.ts");
const fn = (n) => { const i = acts.indexOf(`export async function ${n}`); return acts.slice(i, acts.indexOf("\nexport ", i + 10)); };
const cg = fn("createGroupWorkspace");
check(/requireRole\("admin"\)/.test(cg) && /practiceClientLimit\(gplan\)/.test(cg), "create: admin of a Practice/Enterprise workspace only");
check(/isLapsed\(gstatus\) \|\| isHardStopped\(gstatus\)/.test(cg), "create: a lapsed or suspended group cannot create companies");
check(/sb\.rpc\("cortex_practice_claim"/.test(cg) && !/svc\.rpc\("cortex_practice_claim"/.test(cg), "create: linked AS THE USER through cortex_practice_claim (rank + membership checks)");
check(/await undo\(\)/.test(cg) && cg.indexOf("await undo()") < cg.indexOf("logActivity"), "create: a refused link removes the new workspace");
check(/capabilityPlanOf\(orgId/.test(fn("generateApiKey")), "api keys read the group's plan");
check(/seatLimit\(await \(await import\("@\/lib\/engine\/plan-gate-server"\)\)\.capabilityPlanOf/.test(acts), "seats read the group's plan");
check(/capabilityPlanOf/.test(read("src/app/api/integrations/route.ts")), "integrations read the group's plan");
check(/orgCapability\(orgId, "autonomy"\)/.test(read("src/lib/engine/server-actions.ts")), "Autopilot reads the group's plan");
check(/orgCapability\(orgId, "memory"\)/.test(read("src/lib/memory.ts")), "memory reads the group's plan");

if (failures.length) { console.error(`\ngroup workspaces: ${pass} passed, ${failures.length} failed`); for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
console.log(`group workspaces: ${pass} passed, 0 failed`);
