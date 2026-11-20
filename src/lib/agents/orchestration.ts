import { CORE_AGENTS, CORE_AGENTS_BY_ID, TEAMS, agentsInTeam, leadOf, type CoreAgent, type TeamId } from "./teams";

/*
  ROUTING AND PLANNING — pure functions, no I/O, no model.

  The router decides which team and which agent a request belongs to, from the
  words in it. Deterministic on purpose: the same request routes the same way
  every time, it costs no credits, and scripts/test-agent-workspace.mjs can pin
  its behaviour on real owner phrasings. When the supervisor does use a model
  (to plan a team task), parsePlan() validates what comes back against the
  team roster, and fallbackPlan() is what runs if the model's plan is unusable
  — a team task never fails because a planner returned bad JSON.
*/

export const MAX_SPECIALIST_STEPS = 5;

export type Ranked = { agent: CoreAgent; score: number };
export type Route = {
  team: TeamId;
  agent: CoreAgent;           // the best single agent for the request
  ranked: Ranked[];           // every agent in the team, best first
  mode: "single" | "team";
  reason: string;
};

export type PlanStep = { agent: string; instruction: string };

/*
  `extra` — the workspace's own Agent Studio agents (lib/agents/studio.ts),
  loaded by the caller. Every function below takes them as an optional last
  argument and treats them exactly like built-in specialists of their team.
  With no extras, behaviour is unchanged from the built-in roster.
*/
const teamRoster = (team: TeamId, extra: CoreAgent[] = []) => [...agentsInTeam(team), ...extra.filter((a) => a.team === team && !a.lead)];
export const agentById = (id: string, extra: CoreAgent[] = []): CoreAgent | undefined => CORE_AGENTS_BY_ID[id] ?? extra.find((a) => a.id === id);

const norm = (s: string) => ` ${String(s || "").toLowerCase().replace(/[^a-z0-9()&\-\s]/g, " ").replace(/\s+/g, " ").trim()} `;

/** How strongly a request's words point at one agent. Phrases beat single words. */
export function scoreAgent(agent: CoreAgent, request: string): number {
  const text = norm(request);
  let score = 0;
  for (const k of agent.keywords) {
    const kw = norm(k);
    if (!kw.trim()) continue;
    if (text.includes(kw)) score += kw.trim().includes(" ") ? 3 : 2;
  }
  return score;
}

/** Words that ask for more than one specialist's view. */
const TEAM_WORDS = /\b(everything|overall|full|complete|review|plan|pack|board|month-end|month end|close|end to end|and then|as well as|across)\b/;

export function routeRequest(request: string, hint: TeamId | "auto" = "auto", forceMode?: "single" | "team", extra: CoreAgent[] = []): Route {
  const all: Ranked[] = [...CORE_AGENTS, ...extra.filter((a) => !a.lead)].map((agent) => ({ agent, score: scoreAgent(agent, request) }));

  let team: TeamId;
  if (hint !== "auto" && TEAMS.some((t) => t.id === hint)) team = hint;
  else {
    const byTeam = new Map<TeamId, number>();
    for (const r of all) byTeam.set(r.agent.team, (byTeam.get(r.agent.team) || 0) + r.score);
    const best = [...byTeam.entries()].sort((a, b) => b[1] - a[1])[0];
    /* Nothing matched: finance is the flagship and the safest default for a business question. */
    team = best && best[1] > 0 ? best[0] : "finance";
  }

  const ranked = all.filter((r) => r.agent.team === team)
    .sort((a, b) => b.score - a.score || Number(Boolean(a.agent.lead)) - Number(Boolean(b.agent.lead)));
  const specialists = ranked.filter((r) => !r.agent.lead && r.score > 0);
  const top = specialists[0]?.agent ?? leadOf(team);

  const wantsTeam = TEAM_WORDS.test(norm(request)) || specialists.length >= 2;
  const mode = forceMode ?? (wantsTeam ? "team" : "single");
  const reason = specialists.length
    ? `Matched ${specialists.slice(0, 3).map((r) => r.agent.name).join(", ")}`
    : `No specialist matched strongly, so the ${leadOf(team).name} takes it`;
  return { team, agent: mode === "team" ? leadOf(team) : top, ranked, mode, reason };
}

/** The plan used when no model plan is available or the model's plan is invalid. */
export function fallbackPlan(route: Route, request: string): PlanStep[] {
  const picks = route.ranked.filter((r) => !r.agent.lead && r.score > 0).slice(0, 3).map((r) => r.agent);
  const chosen = picks.length ? picks : agentsInTeam(route.team).filter((a) => !a.lead).slice(0, 2);   // built-ins only as a last resort
  return chosen.map((a) => ({
    agent: a.id,
    instruction: `From your role (${a.role}), work on the owner's request below. Look up what you need with your tools and report specific findings with figures, names and dates. Request: ${request}`,
  }));
}

/**
 * Validate a model-written plan against the team roster.
 * Returns null when it is unusable, so the caller falls back.
 */
export function parsePlan(raw: string, team: TeamId, extra: CoreAgent[] = []): PlanStep[] | null {
  const text = String(raw || "");
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  const as = text.indexOf("["), ae = text.lastIndexOf("]");
  let steps: unknown = null;
  try {
    if (s !== -1 && e > s) steps = (JSON.parse(text.slice(s, e + 1)) as any)?.steps;
  } catch { steps = null; }
  if (!Array.isArray(steps)) {
    try { if (as !== -1 && ae > as) steps = JSON.parse(text.slice(as, ae + 1)); } catch { steps = null; }
  }
  if (!Array.isArray(steps)) return null;
  const roster = new Set(teamRoster(team, extra).filter((a) => !a.lead).map((a) => a.id));
  const out: PlanStep[] = [];
  for (const st of steps as any[]) {
    const agent = String(st?.agent || "").trim();
    const instruction = String(st?.instruction || "").trim().slice(0, 1200);
    if (!roster.has(agent) || instruction.length < 8) continue;
    if (out.some((o) => o.agent === agent)) continue;
    out.push({ agent, instruction });
    if (out.length >= MAX_SPECIALIST_STEPS) break;
  }
  return out.length ? out : null;
}

/** The planning prompt the team lead answers. */
export function planningPrompt(request: string, team: TeamId, extra: CoreAgent[] = []): string {
  const roster = teamRoster(team, extra).filter((a) => !a.lead)
    .map((a) => `- ${a.id}: ${a.name}${a.id.startsWith("ws.") ? " (built by this company)" : ""} — ${a.role} Tools: ${a.tools.join(", ")}`).join("\n");
  return `Plan how your team will handle the owner's request. Choose between 1 and ${MAX_SPECIALIST_STEPS} specialists from this roster — only the ones genuinely needed — and give each a specific instruction.
ROSTER:
${roster}

OWNER'S REQUEST:
${request}

Return ONLY JSON, no prose: {"steps":[{"agent":"<roster id>","instruction":"<what this specialist must find or do>"}]}`;
}

/** The lead's final step: combine the specialists' findings into one answer. */
export function synthesisPrompt(request: string, findings: { agent: string; output: string }[], extra: CoreAgent[] = []): string {
  const body = findings.map((f) => `### ${agentById(f.agent, extra)?.name || f.agent}\n${f.output.slice(0, 3500)}`).join("\n\n");
  return `Your specialists have reported back on the owner's request. Write the final answer for the owner.
Lead with the answer in one sentence. Then the key findings with the specific names, amounts and dates the specialists found. Then a numbered list of next actions, saying which ones are already waiting on the Approvals page.
Use ONLY figures that appear in the findings below. If the specialists disagree or something is missing, say so.

OWNER'S REQUEST:
${request}

SPECIALIST FINDINGS:
${body}`;
}
