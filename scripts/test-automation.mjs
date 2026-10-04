/*
  "AUTOMATE THIS", EXECUTED.

  A sentence becomes workflow steps via a model; validateWorkflowPlan()
  decides whether those steps may exist. What must hold:

    1. Only the eight executor verbs. An invented verb is a refusal with the
       list of real ones — never silently dropped, never saved to fail nightly.
    2. `ai` must name a real mode; `propose` must name a catalogue action whose
       arguments the catalogue accepts; alert/email/note need text.
    3. Bounded: ≤ 8 steps, step ≤ 400 chars, trigger ∈ {schedule, manual},
       name 3–80 chars.
    4. The validator's verb list IS the executor's — read from workflows.ts.
    5. Create re-validates server-side; the model route refunds on failure;
       new workflows default to paused.

  1–3 are executed against the pure module. 4–5 are structural reads.

  Run: node --experimental-strip-types --no-warnings scripts/test-automation.mjs
*/
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const A = await import(join(ROOT, "src/lib/engine/automation.ts"));

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error("  ✗", msg); } };

const deps = {
  modes: ["brief", "risk", "actions"],
  checkAction: (action, args) => {
    if (action === "export_xlsx") return (args && typeof args.dataset === "string") ? { ok: true } : { ok: false, problems: ["dataset is required"] };
    if (action === "raise_alert") return (args && typeof args.message === "string") ? { ok: true } : { ok: false, problems: ["message is required"] };
    return { ok: false, problems: [`"${action}" is not an action`] };
  },
};
const v = (plan) => A.validateWorkflowPlan(plan, deps);
const good = { name: "Morning digest", trigger: "schedule", steps: ["recompute", "receivables", "email Your morning digest"] };

console.log("\n1. verbs");
{
  const r = v(good);
  ok(r.ok && r.plan.steps.length === 3 && r.plan.describe.length === 3, "a plain plan validates with one sentence per step");
  const bad = v({ ...good, steps: ["recompute", "delete_everything now", "email x"] });
  ok(!bad.ok && /not something a workflow can do/.test(bad.problems[0]) && /recompute, receivables/.test(bad.problems[0]), "an invented verb is refused and the real verbs are listed");
  ok(v({ ...good, steps: ["Recompute:", "RECEIVABLES,", "EMAIL hello"] }).ok, "verbs are case-insensitive and tolerate a trailing colon/comma (executor parity)");
  ok(v({ ...good, steps: [{ text: "recompute" }] }).ok, "an object step with text is accepted (the scheduler tolerates this shape)");
  ok(!v({ ...good, steps: ["", "recompute"] }).ok, "an empty step is refused");
  ok(!v({ ...good, steps: ["note " + "x".repeat(400)] }).ok, "a 400+ character step is refused");
  for (const verb of A.WORKFLOW_VERBS) {
    const sample = { recompute: "recompute", receivables: "receivables", reorder: "reorder", alert: "alert Stock is low", email: "email Daily", note: "note ran", ai: "ai brief", propose: 'propose raise_alert {"message":"hi"}' }[verb];
    ok(v({ ...good, steps: [sample] }).ok, `verb "${verb}" validates with a well-formed step`);
  }
}

console.log("\n2. arguments");
{
  ok(!v({ ...good, steps: ["ai poetry"] }).ok, "ai with an unknown mode is refused");
  ok(/brief, risk, actions/.test(v({ ...good, steps: ["ai poetry"] }).problems[0]), "…and the real modes are listed");
  ok(v({ ...good, steps: ["ai risk what could go wrong this month"] }).ok, "ai with a real mode and a prompt validates");
  ok(!v({ ...good, steps: ["ai"] }).ok, "ai without a mode is refused");
  ok(!v({ ...good, steps: ["propose nuke_db {}"] }).ok, "propose with an unknown action is refused");
  ok(!v({ ...good, steps: ['propose export_xlsx {"nope":1}'] }).ok, "propose whose args the catalogue rejects is refused");
  ok(!v({ ...good, steps: ["propose export_xlsx {not json"] }).ok, "propose with broken JSON is refused");
  ok(v({ ...good, steps: ['propose export_xlsx {"dataset":"receivables_ageing"}'] }).ok, "propose with a valid action and args validates");
  ok(!v({ ...good, steps: ["email"] }).ok && !v({ ...good, steps: ["alert"] }).ok && !v({ ...good, steps: ["note"] }).ok, "email/alert/note need text");
  ok(!v({ ...good, steps: ["email ab"] }).ok, "two characters is not text");
}

console.log("\n3. bounds");
{
  ok(!v({ ...good, steps: [] }).ok, "no steps refused");
  ok(!v({ ...good, steps: Array(A.MAX_STEPS + 1).fill("recompute") }).ok, "over MAX_STEPS refused");
  ok(v({ ...good, steps: Array(A.MAX_STEPS).fill("recompute") }).ok, "exactly MAX_STEPS accepted");
  ok(!v({ ...good, trigger: "event" }).ok && !v({ ...good, trigger: "hourly" }).ok, "trigger must be schedule or manual");
  ok(v({ ...good, trigger: "manual" }).ok, "manual accepted");
  ok(!v({ ...good, name: "ab" }).ok, "a two-letter name is refused");
  const long = v({ ...good, name: "x".repeat(200) });
  ok(long.ok && long.plan.name.length === 80, "a long name is cut to 80");
  ok(!v(null).ok && !v("recompute").ok && !v([]).ok, "non-object plans are refused");
  ok(!v({ ...good, steps: ["recompute", "bogus"] }).ok, "one bad step fails the whole plan — nothing partial is ever saved");
}

console.log("\n4. the validator's verbs are the executor's");
{
  const wf = read("src/lib/workflows.ts");
  const executorVerbs = [...wf.matchAll(/\{ verb: "([a-z_]+)"/g)].map((m) => m[1]).sort();
  const ours = [...A.WORKFLOW_VERBS].sort();
  ok(JSON.stringify(executorVerbs) === JSON.stringify(ours), `verb lists match: executor ${executorVerbs.join(",")} vs validator ${ours.join(",")}`);
  for (const vb of ours) ok(new RegExp(`case "${vb}":`).test(wf), `executor has a case for "${vb}"`);
  const srv = read("src/lib/engine/automation-server.ts");
  const modes = [...srv.match(/WORKFLOW_AI_MODES = \[([\s\S]*?)\]/)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const cortex = read("src/lib/ai/cortex.ts");
  const promptKeys = new Set([...cortex.slice(cortex.indexOf("const MODE_PROMPTS")).matchAll(/^  ([a-z_]+): `/gm)].map((m) => m[1]));
  for (const m of modes) ok(promptKeys.has(m), `ai mode "${m}" exists in MODE_PROMPTS (otherwise generateFor silently falls back to pulse)`);
}

console.log("\n5. wiring");
{
  const act = read("src/lib/actions.ts");
  const c = act.slice(act.indexOf("export async function createWorkflowFromPlan"), act.indexOf("export async function toggleWorkflow"));
  ok(/validateWorkflowPlan\(input\?\.plan, automationDeps\(\)\)/.test(c), "create re-validates the plan server-side");
  ok(/requireCapability\(orgId, "workflows"/.test(c), "create is gated by the workflows capability like the form");
  ok(/is_active: input\?\.activate === true/.test(c), "new workflows are paused unless explicitly activated");
  ok(/steps: v\.plan\.steps/.test(c), "the saved steps are the VALIDATED ones, not the request's");
  const t = act.slice(act.indexOf("export async function toggleWorkflow"), act.indexOf("export async function runWorkflow"));
  ok(/\.eq\("org_id", orgId\)\.select\("id"\)/.test(t) && /data\.length !== 1/.test(t), "pause/resume is org-scoped and reads the row back");
  const route = read("src/app/api/automation/plan/route.ts");
  ok(/hasRole\("analyst"\)/.test(route), "the plan route needs analyst");
  ok(/chargeForMode\("automation_plan"\)/.test(route) && (route.match(/refundIfCharged\(gate, "automation_plan"\)/g) || []).length >= 2, "charged as automation_plan, refunded on both failure paths");
  ok(/automation_plan: 14/.test(read("src/lib/config.ts")) && /automation_plan: "FAST"/.test(read("src/lib/pricing-model.ts")) && /automation_plan: FAST/.test(read("src/lib/ai/generation.ts")), "automation_plan is priced in all three tables");
  const page = read("src/app/(app)/workflows/page.tsx");
  ok(/<AutomateThis \/>/.test(page) && /toggleWorkflow/.test(page), "the page offers Automate this and pause/resume");
  const comp = read("src/components/automate-this.tsx");
  ok(/create\(false\)[\s\S]*?Create paused/.test(comp) && /create\(true\)[\s\S]*?Create & activate/.test(comp), "the component offers paused (default) and active creation");
}

console.log(`\nautomation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
