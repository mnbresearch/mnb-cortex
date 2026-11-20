import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { agentLimits } from "@/lib/config";
import type { CoreAgent } from "@/lib/agents/teams";
import { toCoreAgent, validateSpec, type AgentSpec, type WorkspaceAgentRow } from "@/lib/agents/studio";

/*
  Agent Studio storage (table workspace_agents, 2026_zzzz_u_workspace_agents.sql).

  Reads and writes go through the service client AFTER the caller's role
  check (the API routes require "analyst" or higher to change agents, as for
  the template builder). The runner calls workspaceAgents() to load a
  workspace's active agents into routing, planning and its steps.

  Fails soft: if the table is missing (migration not run) every read returns
  no agents, so the built-in teams work exactly as before.
*/

const db = () => serviceClient() as any;
type StudioRow = WorkspaceAgentRow & { created_at?: string; updated_at?: string };

function rowOf(d: any): StudioRow {
  return {
    id: String(d.id), team: d.team, name: String(d.name || ""), role: String(d.role || ""), instructions: String(d.instructions || ""),
    tools: Array.isArray(d.tools) ? d.tools.map(String) : [], keywords: Array.isArray(d.keywords) ? d.keywords.map(String) : [],
    active: d.active !== false, created_at: d.created_at, updated_at: d.updated_at,
  };
}

export async function studioReady(): Promise<boolean> {
  const sb = db(); if (!sb) return false;
  try { const { error } = await sb.from("workspace_agents").select("id").limit(1); return !error; } catch { return false; }
}

/** Every agent the workspace has built, active or paused — for the Studio screen. */
export async function listWorkspaceAgents(orgId: string): Promise<StudioRow[]> {
  const sb = db(); if (!sb) return [];
  try {
    const { data, error } = await sb.from("workspace_agents").select("*").eq("org_id", orgId).order("created_at", { ascending: true }).limit(200);
    return error ? [] : (data || []).map(rowOf);
  } catch { return []; }
}

/** The workspace's ACTIVE agents, in runner shape. Never throws. */
export async function workspaceAgents(orgId: string | null | undefined): Promise<CoreAgent[]> {
  if (!orgId) return [];
  return (await listWorkspaceAgents(orgId)).filter((r) => r.active).map(toCoreAgent);
}

async function planOf(orgId: string): Promise<string> {
  const { data } = await db().from("organizations").select("plan").eq("id", orgId).maybeSingle();
  return String((data as any)?.plan || "").toLowerCase();
}

export async function studioLimit(orgId: string): Promise<number> {
  try { return agentLimits(await planOf(orgId)).studioAgents; } catch { return agentLimits(null).studioAgents; }
}

type Res<T> = { ok: true; data: T } | { ok: false; error: string; code?: "limit" | "not_ready" };

export async function createWorkspaceAgent(orgId: string, userId: string | null, raw: Partial<AgentSpec>): Promise<Res<WorkspaceAgentRow>> {
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  if (!(await studioReady())) return { ok: false, code: "not_ready", error: "Agent Studio needs its database table: run supabase/RUN-2026-11-20-workspace-agents.sql." };
  const v = validateSpec(raw); if (!v.ok) return v;
  const limit = agentLimits(await planOf(orgId)).studioAgents;
  const { count } = await sb.from("workspace_agents").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if ((count ?? 0) >= limit) return { ok: false, code: "limit", error: `Your plan includes ${limit} Agent Studio agent${limit === 1 ? "" : "s"}, and ${limit === 1 ? "it is" : "they are all"} in use. Remove one or upgrade for more.` };
  const { data, error } = await sb.from("workspace_agents").insert({ org_id: orgId, created_by: userId, ...v.spec }).select("*").single();
  if (error || !data) return { ok: false, error: error?.message || "Could not save the agent." };
  return { ok: true, data: rowOf(data) };
}

export async function updateWorkspaceAgent(orgId: string, id: string, raw: Partial<AgentSpec> & { active?: boolean }): Promise<Res<WorkspaceAgentRow>> {
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  const { data: cur } = await sb.from("workspace_agents").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!cur) return { ok: false, error: "That agent was not found in this workspace." };
  const merged = { ...rowOf(cur), ...raw };
  const v = validateSpec(merged); if (!v.ok) return v;
  const patch: any = { ...v.spec, updated_at: new Date().toISOString() };
  if (typeof raw.active === "boolean") patch.active = raw.active;
  const { data, error } = await sb.from("workspace_agents").update(patch).eq("id", id).eq("org_id", orgId).select("*").single();
  if (error || !data) return { ok: false, error: error?.message || "Could not update the agent." };
  return { ok: true, data: rowOf(data) };
}

export async function deleteWorkspaceAgent(orgId: string, id: string): Promise<Res<null>> {
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  const { error } = await sb.from("workspace_agents").delete().eq("id", id).eq("org_id", orgId);
  return error ? { ok: false, error: error.message } : { ok: true, data: null };
}
