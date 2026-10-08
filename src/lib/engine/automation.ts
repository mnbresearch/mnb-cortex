/*
  "AUTOMATE THIS" — a sentence becomes a workflow, deterministically checked.

  The owner says what they want in words: "every morning, refresh the KPIs,
  list who is overdue, and email me". A model turns that into steps in the
  workflow grammar lib/workflows.ts already executes. THIS file is the part
  that decides whether those steps are allowed to exist:

    · every step's verb must be one of the eight the executor knows
    · `ai` must name a real mode
    · `propose` must name a catalogue action whose arguments validate, so a
      workflow cannot be created that will fail every night at 10:00
    · `email` and `alert` must carry text; `note` too
    · at most 8 steps; a trigger of schedule | manual
    · the name is short and plain

  Pure and dependency-free (the mode list and the catalogue validator are
  passed in), so the test executes it in plain Node. The server re-runs this
  on create — the browser is never trusted to have kept the plan intact.
*/

export const WORKFLOW_VERBS = ["recompute", "receivables", "reorder", "alert", "email", "ai", "note", "propose", "agent"] as const;
export type WorkflowVerb = typeof WORKFLOW_VERBS[number];
export const MAX_STEPS = 8;

export type ValidateDeps = {
  /** AI modes that `ai <mode>` may run. */
  modes: readonly string[];
  /** The catalogue check for `propose <action> <json>`; returns problems when refused. */
  checkAction: (action: string, args: unknown) => { ok: true } | { ok: false; problems: string[] };
  /** Whether `agent <id>` names a ready-made TEXT agent. Omitted → any well-formed id is accepted (the executor re-checks). */
  checkAgent?: (id: string) => boolean;
};

export type WorkflowPlan = { name: string; trigger: "schedule" | "manual"; steps: string[]; describe: string[] };
export type ValidatedPlan = { ok: true; plan: WorkflowPlan } | { ok: false; problems: string[] };

const VERB_WORDS: Record<WorkflowVerb, (rest: string) => string> = {
  recompute: () => "Refresh every KPI from current data.",
  receivables: () => "Total what is overdue and list the worst offenders.",
  reorder: () => "Find stock at or below its reorder level.",
  alert: (r) => `Raise an in-app alert: "${r}".`,
  email: (r) => `Email the workspace owner a summary titled "${r}".`,
  note: (r) => `Record in the run log: "${r}".`,
  ai: (r) => { const [mode, ...tail] = r.split(/\s+/); return `Run the "${mode}" analysis${tail.length ? ` on: ${tail.join(" ")}` : ""} and save the output.`; },
  agent: (r) => { const sp = r.indexOf(" "); const id = sp === -1 ? r : r.slice(0, sp); const brief = sp === -1 ? "" : r.slice(sp + 1).trim(); return `Run the "${id}" agent on this workspace's numbers${brief ? ` — ${brief}` : ""} — and save its output.`; },
  propose: (r) => { const sp = r.indexOf(" "); const action = sp === -1 ? r : r.slice(0, sp); return `Ask Cortex to ${action.replace(/_/g, " ")} — runs if your rule allows it, otherwise waits on Approvals.`; },
};

export function parseStep(step: string): { verb: string; rest: string } {
  const t = String(step || "").trim();
  const sp = t.indexOf(" ");
  const head = (sp === -1 ? t : t.slice(0, sp)).toLowerCase().replace(/[:,]$/, "");
  return { verb: head, rest: sp === -1 ? "" : t.slice(sp + 1).trim() };
}

export function validateWorkflowPlan(raw: unknown, deps: ValidateDeps): ValidatedPlan {
  const problems: string[] = [];
  const o: any = raw && typeof raw === "object" ? raw : {};

  const name = String(o.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 3) problems.push("The workflow needs a short name.");

  const trigger = o.trigger === "schedule" ? "schedule" : o.trigger === "manual" ? "manual" : null;
  if (!trigger) problems.push(`The trigger must be "schedule" (runs daily) or "manual" (runs when you press Run); got ${JSON.stringify(o.trigger)}.`);

  const rawSteps: unknown[] = Array.isArray(o.steps) ? o.steps : [];
  if (rawSteps.length === 0) problems.push("The workflow has no steps.");
  if (rawSteps.length > MAX_STEPS) problems.push(`Too many steps (${rawSteps.length}); the limit is ${MAX_STEPS}.`);

  const steps: string[] = [];
  const describe: string[] = [];
  rawSteps.slice(0, MAX_STEPS).forEach((s, i) => {
    const n = i + 1;
    const text = typeof s === "string" ? s.trim() : typeof (s as any)?.text === "string" ? String((s as any).text).trim() : "";
    if (!text) { problems.push(`Step ${n} is empty.`); return; }
    if (text.length > 400) { problems.push(`Step ${n} is too long (${text.length} characters; limit 400).`); return; }
    const { verb, rest } = parseStep(text);
    if (!(WORKFLOW_VERBS as readonly string[]).includes(verb)) {
      problems.push(`Step ${n}: "${verb}" is not something a workflow can do. Available: ${WORKFLOW_VERBS.join(", ")}.`);
      return;
    }
    switch (verb as WorkflowVerb) {
      case "alert": case "email": case "note":
        if (rest.length < 3) { problems.push(`Step ${n}: ${verb} needs some text after it.`); return; }
        break;
      case "ai": {
        const mode = rest.split(/\s+/)[0] || "";
        if (!deps.modes.includes(mode)) { problems.push(`Step ${n}: "${mode}" is not an AI mode. Available: ${deps.modes.join(", ")}.`); return; }
        break;
      }
      case "agent": {
        const id = (rest.split(/\s+/)[0] || "").trim();
        if (!/^[a-z0-9_.-]{3,80}$/i.test(id)) { problems.push(`Step ${n}: agent needs an agent id, e.g. "agent d_sales.winback".`); return; }
        if (deps.checkAgent && !deps.checkAgent(id)) { problems.push(`Step ${n}: "${id}" is not a ready-made text agent.`); return; }
        break;
      }
      case "propose": {
        const sp = rest.indexOf(" ");
        const action = (sp === -1 ? rest : rest.slice(0, sp)).trim();
        const jsonText = sp === -1 ? "{}" : rest.slice(sp + 1).trim();
        let args: unknown = {};
        try { args = jsonText ? JSON.parse(jsonText) : {}; }
        catch { problems.push(`Step ${n}: the arguments after "${action}" are not valid JSON.`); return; }
        const c = deps.checkAction(action, args);
        if (!c.ok) { problems.push(`Step ${n}: ${c.problems.join("; ")}`); return; }
        break;
      }
      default: break; // recompute / receivables / reorder take no argument; anything after them is ignored by the executor
    }
    steps.push(text);
    describe.push(VERB_WORDS[verb as WorkflowVerb](rest));
  });

  if (problems.length) return { ok: false, problems };
  return { ok: true, plan: { name, trigger: trigger!, steps, describe } };
}

/** Lines for the model's instructions: the exact grammar, nothing more. */
export function grammarForModel(modes: readonly string[], actions: Array<{ key: string; args: string }>): string {
  return [
    "Each step is ONE line: a verb, then its argument. Verbs:",
    "  recompute                     — refresh KPIs",
    "  receivables                   — total overdue invoices, list the worst",
    "  reorder                       — stock below reorder level",
    "  alert <message>               — in-app alert",
    "  email <subject>               — email the owner a run summary (findings from earlier steps are included automatically)",
    `  ai <mode> <prompt>            — modes: ${modes.join(", ")}`,
    "  note <text>                   — write to the run log",
    "  propose <action> <json-args>  — ask Cortex to act; runs only if the owner's rule allows, else waits for approval",
    "  agent <agent-id> <brief>      — run a ready-made text agent on this workspace's own numbers and save its output",
    "Actions for propose and their JSON arguments:",
    ...actions.map((a) => `  ${a.key} ${a.args}`),
    "Put lookups (recompute, receivables, reorder) BEFORE the email so the email has something to say.",
  ].join("\n");
}
