import { findAgent } from "@/lib/agents/catalog";
import "server-only";
import { vaultFor } from "@/lib/ai/dlp-server";
import { geminiTextModels } from "@/lib/ai/models";
import { aiKey } from "@/lib/ai/byo";
import { generationConfig, FAST } from "@/lib/ai/generation";
import { groqModel } from "@/lib/ai/model-defaults";
import { CATALOGUE, CATALOGUE_BY_KEY, validateArgs } from "@/lib/engine/catalogue";
import { validateWorkflowPlan, grammarForModel, type ValidatedPlan, type ValidateDeps } from "@/lib/engine/automation";

/*
  The model half of "Automate this". Mirrors transform-server.ts: Gemini in
  JSON mode, Groq as the fallback, and whatever comes back goes through
  validateWorkflowPlan() before anyone sees it. The model is told the exact
  grammar and nothing about the database.
*/

/** The AI modes a workflow `ai` step may run — the ones generateFor() knows. */
export const WORKFLOW_AI_MODES = [
  "brief", "actions", "risk", "costs", "forecast", "pulse", "investor", "benchmark", "pricing", "hiring", "gst", "marketing", "competitor", "vendor", "strategy", "board",
] as const;

export function automationDeps(): ValidateDeps {
  return {
    modes: WORKFLOW_AI_MODES,
    checkAction: (action, args) => {
      const def = CATALOGUE_BY_KEY[action];
      if (!def) return { ok: false, problems: [`"${action}" is not an action Cortex can take. Actions: ${Object.keys(CATALOGUE_BY_KEY).join(", ")}.`] };
      const v = validateArgs(def, args);
      return v.ok ? { ok: true } : { ok: false, problems: v.problems };
    },
    checkAgent: (id) => findAgent(id)?.kind === "reasoning",
  };
}

const argsLine = (def: typeof CATALOGUE[number]) =>
  "{" + Object.entries(def.args).map(([k, s]) => `"${k}": <${s.type}${s.values ? ` ${s.values.join("|")}` : ""}${s.required ? "" : ", optional"}>`).join(", ") + "}";

/* Actions a scheduled workflow can sensibly propose without a specific row id. */
const PROPOSABLE = CATALOGUE.filter((d) => !Object.values(d.args).some((a) => a.type === "uuid" && a.required));

const SYS = `You turn a business owner's sentence into a small automation for their finance workspace.
Return ONLY JSON: {"name": string, "trigger": "schedule"|"manual", "steps": [string, ...], "note": string}.
"schedule" means it runs once every day; use it when the sentence says daily, every morning, each week, regularly, automatically. Otherwise "manual".
${grammarForModel(WORKFLOW_AI_MODES, PROPOSABLE.map((d) => ({ key: d.key, args: argsLine(d) })))}
Rules: at most 8 steps. Never invent a verb. Never put an invoice id in propose args — you do not know any. If the request cannot be done with these verbs, return {"name":"","trigger":"manual","steps":[],"note":"<one sentence saying what is not possible>"}.`;

export type PlanOutcome =
  | { ok: true; plan: Extract<ValidatedPlan, { ok: true }>["plan"]; note: string }
  | { ok: false; problems: string[]; note: string; error: string };

export async function planWorkflowWithModel(instruction: string): Promise<PlanOutcome> {
  /* DLP: a party named in the request is tokenised; the plan's arguments get the real name back. */
  const vault = await vaultFor();
  const raw = vault.restoreDeep(await askJson(vault.redact(`REQUEST\n${instruction.slice(0, 600)}`)));
  if (!raw) return { ok: false, error: "Cortex could not plan that right now — the AI provider did not answer. Try again in a moment.", problems: [], note: "" };
  const note = String((raw as any)?.note || "").slice(0, 300);
  const steps = (raw as any)?.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return { ok: false, error: note || "Cortex could not turn that into steps a workflow can run.", problems: [`A workflow can: ${grammarForModel(WORKFLOW_AI_MODES, []).split("\n").slice(1, 9).map((l) => l.trim().split(/\s{2,}/)[0]).join(", ")}.`], note };
  }
  const v = validateWorkflowPlan(raw, automationDeps());
  if (!v.ok) return { ok: false, error: "Cortex planned something a workflow cannot run, so nothing was created.", problems: v.problems, note };
  return { ok: true, plan: v.plan, note };
}

async function askJson(prompt: string): Promise<unknown | null> {
  const gkey = aiKey("GEMINI_API_KEY");
  if (gkey) {
    try {
      const model = geminiTextModels()[0];
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(gkey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYS }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: generationConfig(FAST, { temperature: 0.1, responseMimeType: "application/json" }),
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) { const j = await r.json(); const t = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(""); const p = safeJson(t); if (p) return p; }
    } catch { /* fall through */ }
  }
  const qkey = aiKey("GROQ_API_KEY");
  if (qkey) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${qkey}` },
        body: JSON.stringify({ model: groqModel(), messages: [{ role: "system", content: SYS }, { role: "user", content: prompt }], temperature: 0.1, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) { const j = await r.json(); const p = safeJson(j?.choices?.[0]?.message?.content || ""); if (p) return p; }
    } catch { /* fall through */ }
  }
  return null;
}

function safeJson(t: string): unknown | null {
  const s = String(t || "").trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch { return null; }
}
