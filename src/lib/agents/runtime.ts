import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { runCortex } from "@/lib/ai/cortex";
import { findAgent, type Agent, type AgentInput } from "@/lib/agents/catalog";

export type ResolvedAgent = Agent & { custom?: boolean };

/** Resolve an agent by id — catalog first, then a workspace's custom (AI-built) agent. */
export async function resolveAgent(orgId: string | null, agentId: string): Promise<ResolvedAgent | null> {
  const cat = findAgent(agentId);
  if (cat) return cat;
  if (!orgId || !agentId?.startsWith("custom.")) return null;
  const svc = serviceClient(); if (!svc) return null;
  try {
    const realId = agentId.replace(/^custom\./, "");
    const { data } = await svc.from("agent_specs").select("*").eq("id", realId).eq("org_id", orgId).maybeSingle();
    if (!data) return null;
    const d = data as any;
    return { id: agentId, industry: d.industry || "custom", name: d.name, desc: d.description || "", kind: "reasoning", inputs: (d.inputs as AgentInput[]) || [], prompt: d.prompt || "", exports: ["pdf", "md", "copy"], custom: true };
  } catch { return null; }
}

export function fillPrompt(prompt: string, inputs: Record<string, string>, reviseNote?: string, prior?: string): string {
  let p = prompt.replace(/\{\{(\w+)\}\}/g, (_, k) => (inputs?.[k] ?? "").toString().trim() || "(not provided)");
  if (reviseNote && prior) {
    p += `\n\n---\nA previous draft was produced (below). The user asked for this revision: "${reviseNote}". Rewrite the output applying the revision while keeping everything else that worked.\nPREVIOUS DRAFT:\n${prior.slice(0, 4000)}`;
  }
  return p;
}

/** Run a reasoning agent through the model. */
export async function runReasoning(prompt: string): Promise<string> {
  return runCortex([{ role: "user", content: prompt }], "");
}

export async function saveRun(orgId: string, userId: string | null, agent: ResolvedAgent, inputs: any, output: string, version: number) {
  const svc = serviceClient(); if (!svc) return null;
  try {
    const { data } = await svc.from("agent_runs").insert({
      org_id: orgId, agent_id: agent.id, agent_name: agent.name, inputs, output, version, status: "draft", created_by: userId,
    }).select("id").single();
    return (data as any)?.id ?? null;
  } catch { return null; }
}

/** Distinct agent ids this workspace has run at least once (for workforce progress). */
export async function activatedAgentIds(orgId: string): Promise<string[]> {
  const svc = serviceClient(); if (!svc || !orgId) return [];
  try {
    const { data } = await svc.from("agent_runs").select("agent_id").eq("org_id", orgId).limit(2000);
    return Array.from(new Set(((data as any[]) || []).map((r) => r.agent_id).filter(Boolean)));
  } catch { return []; }
}

export async function listRuns(orgId: string, limit = 30) {
  const svc = serviceClient(); if (!svc || !orgId) return [];
  try {
    const { data } = await svc.from("agent_runs").select("id,agent_id,agent_name,version,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
    return (data as any[]) || [];
  } catch { return []; }
}

/* --------------------------------------------------------- AI agent-builder */

function firstJsonArray(text: string): any[] | null {
  const s = text.indexOf("["); const e = text.lastIndexOf("]");
  try { if (s !== -1 && e > s) { const a = JSON.parse(text.slice(s, e + 1)); return Array.isArray(a) ? a : null; } } catch {}
  return null;
}

/** Cortex designs new agents on its own for a described business, and saves them. */
export async function buildAgentsForBusiness(orgId: string, userId: string | null, business: string, goals: string) {
  const prompt = `You are Cortex's agent architect. Design 4 practical, text/reasoning AI agents that a "${business}" business would genuinely use, aimed at these goals: ${goals || "grow revenue and save time"}.
Return ONLY a JSON array. Each item: {"name":"short name","desc":"one line","inputs":[{"key":"lowercase_key","label":"Field label","type":"text|textarea|number"}],"prompt":"an instruction template that uses {{key}} placeholders matching the inputs and tells the model exactly what to produce"}.
Make each agent concrete and immediately useful. 2-4 inputs each.`;
  let out = "";
  try { out = await runCortex([{ role: "user", content: prompt }], ""); } catch { return { count: 0, agents: [] }; }
  const arr = firstJsonArray(out);
  if (!arr) return { count: 0, agents: [] };
  const svc = serviceClient(); if (!svc) return { count: 0, agents: [] };
  const saved: any[] = [];
  for (const a of arr.slice(0, 4)) {
    if (!a?.name || !a?.prompt) continue;
    try {
      const { data } = await svc.from("agent_specs").insert({
        org_id: orgId, name: String(a.name).slice(0, 80), industry: "custom", description: String(a.desc || "").slice(0, 200),
        kind: "reasoning", inputs: Array.isArray(a.inputs) ? a.inputs.slice(0, 5) : [], prompt: String(a.prompt).slice(0, 3000), created_by: userId,
      }).select("*").single();
      if (data) saved.push(data);
    } catch {}
  }
  return { count: saved.length, agents: saved };
}

export async function listCustomAgents(orgId: string) {
  const svc = serviceClient(); if (!svc || !orgId) return [];
  try {
    const { data } = await svc.from("agent_specs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
    return ((data as any[]) || []).map((d) => ({ id: `custom.${d.id}`, industry: "custom", name: d.name, desc: d.description || "", kind: "reasoning" as const, inputs: d.inputs || [], prompt: d.prompt || "", exports: ["pdf", "md", "copy"] }));
  } catch { return []; }
}
