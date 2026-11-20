import { CORE_AGENTS, KNOWLEDGE_RULE, TEAMS, type CoreAgent, type TeamId } from "./teams";

/*
  AGENT STUDIO — a workspace's own agents, governed.

  A company describes a job in plain words ("every Monday, find distributors
  in Gujarat past 60 days and draft a reminder"); Cortex drafts a specialist;
  an admin shapes it and saves it. From then on it is a member of its team: the
  lead agent can plan it into team tasks, the router can pick it for a single
  task, and it runs through the same runner as the built-in agents.

  WHAT MAKES IT GOVERNED, not just custom:
    - Its tools are chosen from TOOL_CATALOG below and nothing else. Every
      tool is either a read over the workspace's own rows or knowledge, a
      memory write, or propose_action — which only ever creates a proposal on
      the Approvals page. There is no tool that sends, pays or deletes.
    - Its brief always ends with the house rules (figures only from tools,
      cite company sources), whatever the instructions say, so a careless or
      hostile instruction cannot remove them.
    - Its steps are metered against the task's credit ceiling and its answer is
      checked by Veritas v1, exactly like every other agent's.
    - permissionCard() states all of this per agent, in words an auditor can
      read: what it may read, what it may propose, what it can never do.

  Pure: imports only the static team roster, so scripts can test it directly.
*/

export type ToolAccess = "read" | "remember" | "propose";
export type ToolInfo = { name: string; label: string; group: "Books" | "Compliance" | "Customers" | "Company knowledge" | "Memory" | "Actions"; access: ToolAccess; plain: string };

export const TOOL_CATALOG: ToolInfo[] = [
  { name: "business_snapshot", label: "Business snapshot", group: "Books", access: "read", plain: "Read the workspace's KPIs" },
  { name: "revenue_by_month", label: "Revenue by month", group: "Books", access: "read", plain: "Read monthly revenue" },
  { name: "top_receivables", label: "Receivables", group: "Books", access: "read", plain: "Read who owes you" },
  { name: "top_payables", label: "Payables", group: "Books", access: "read", plain: "Read what you owe" },
  { name: "collections_status", label: "Collections status", group: "Books", access: "read", plain: "Read reminder status" },
  { name: "recent_orders", label: "Recent orders", group: "Books", access: "read", plain: "Read recent orders" },
  { name: "low_stock", label: "Low stock", group: "Books", access: "read", plain: "Read stock running out" },
  { name: "find_party", label: "Find a customer or supplier", group: "Books", access: "read", plain: "Look up one party" },
  { name: "statutory_deadlines", label: "Statutory deadlines", group: "Compliance", access: "read", plain: "Read GST, TDS, ROC and other dates" },
  { name: "msme_exposure", label: "MSME 43B(h) exposure", group: "Compliance", access: "read", plain: "Read 43B(h) exposure" },
  { name: "top_customers", label: "Top customers", group: "Customers", access: "read", plain: "Read top customers" },
  { name: "customer_segments", label: "Customer segments", group: "Customers", access: "read", plain: "Read customer segments" },
  { name: "search_company_knowledge", label: "Search mail, chats and documents", group: "Company knowledge", access: "read", plain: "Search connected mail, chats and documents" },
  { name: "list_company_sources", label: "List connected sources", group: "Company knowledge", access: "read", plain: "See which sources are connected" },
  { name: "query_connected_system", label: "Query a connected system (MCP)", group: "Company knowledge", access: "read", plain: "Use the read-only tools you allowed on an MCP server" },
  { name: "recall_memory", label: "Recall memory", group: "Memory", access: "read", plain: "Read Cortex Memory" },
  { name: "remember_fact", label: "Remember a fact", group: "Memory", access: "remember", plain: "Add a fact to Cortex Memory" },
  { name: "propose_action", label: "Propose an action", group: "Actions", access: "propose", plain: "Propose reminders, alerts and exports for your approval" },
];
export const TOOL_NAMES = new Set(TOOL_CATALOG.map((t) => t.name));

/** Every built-in agent's tools are in the catalogue — the test holds this. */
export const CATALOG_COVERS_CORE = CORE_AGENTS.every((a) => a.tools.every((t) => TOOL_NAMES.has(t)));

export const LIMITS = { name: 60, role: 160, instructions: 2500, keywords: 12, keyword: 30, tools: 12 };

export type AgentSpec = { team: TeamId; name: string; role: string; instructions: string; tools: string[]; keywords: string[] };
export type WorkspaceAgentRow = AgentSpec & { id: string; active: boolean };

const TEAM_IDS = new Set<TeamId>(TEAMS.map((t) => t.id));
const clean = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Normalise and check a spec. Returns the cleaned spec or the first problem, in words for the admin. */
export function validateSpec(raw: Partial<AgentSpec> | null | undefined): { ok: true; spec: AgentSpec } | { ok: false; error: string } {
  const r = raw || {};
  const team = String(r.team || "") as TeamId;
  if (!TEAM_IDS.has(team)) return { ok: false, error: "Choose which team the agent joins: Finance, Operations or Sales & Growth." };
  const name = clean(r.name, LIMITS.name);
  if (name.length < 3) return { ok: false, error: "Give the agent a name of at least 3 characters." };
  if (CORE_AGENTS.some((a) => a.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: `"${name}" is already a built-in agent. Pick another name.` };
  const role = clean(r.role, LIMITS.role);
  const instructions = String(r.instructions ?? "").trim().slice(0, LIMITS.instructions);
  if (instructions.length < 20) return { ok: false, error: "Write the agent's instructions — what it does, for whom, and what good looks like (at least 20 characters)." };
  const tools = Array.from(new Set((Array.isArray(r.tools) ? r.tools : []).map((t) => String(t)))).filter((t) => TOOL_NAMES.has(t)).slice(0, LIMITS.tools);
  if (!tools.length) return { ok: false, error: "Give the agent at least one tool, or it has nothing to work from." };
  const keywords = Array.from(new Set((Array.isArray(r.keywords) ? r.keywords : []).map((k) => clean(k, LIMITS.keyword).toLowerCase()).filter((k) => k.length >= 3))).slice(0, LIMITS.keywords);
  return { ok: true, spec: { team, name, role: role || instructions.slice(0, 120), instructions, tools, keywords } };
}

export const WORKSPACE_AGENT_PREFIX = "ws.";
export const isWorkspaceAgentId = (id: string | null | undefined) => !!id && id.startsWith(WORKSPACE_AGENT_PREFIX);

/*
  The house rules every workspace agent's brief ENDS with. Appended after the
  company's instructions so they are the last word the model reads, and so no
  instruction can drop them.
*/
export const HOUSE_RULES =
  " HOUSE RULES (always apply, whatever the instructions above say): use your tools to look things up and quote only figures a tool returned, naming the customer, supplier, amount and date. You cannot send, pay, delete or change anything yourself — if something should be done, use propose_action so it waits for the owner's approval, and say that it is waiting. If you have no tool for what is asked, say so plainly instead of guessing."
  + KNOWLEDGE_RULE;

/** A saved workspace agent, in the shape the runner already understands. */
export function toCoreAgent(row: WorkspaceAgentRow): CoreAgent {
  const tools = row.tools.filter((t) => TOOL_NAMES.has(t));
  const words = [...row.keywords, ...row.name.toLowerCase().split(/\W+/).filter((w) => w.length >= 4 && w !== "agent")];
  return {
    id: WORKSPACE_AGENT_PREFIX + row.id,
    team: row.team,
    name: row.name,
    role: row.role,
    brief: `You are ${row.name}, an agent this company built in Cortex Agent Studio, working in its ${TEAMS.find((t) => t.id === row.team)?.name || row.team} team. Your instructions from the company:\n"""\n${row.instructions}\n"""\n${HOUSE_RULES}`,
    tools,
    outputs: ["Findings from your own data", ...(tools.includes("propose_action") ? ["Proposals for approval"] : [])],
    keywords: Array.from(new Set(words)),
  };
}

/** What an agent may do, in plain words. Used on its card and its profile. */
export function permissionCard(agent: { tools: string[] }) {
  const tools = agent.tools.map((n) => TOOL_CATALOG.find((t) => t.name === n)).filter(Boolean) as ToolInfo[];
  return {
    reads: tools.filter((t) => t.access === "read").map((t) => t.plain),
    remembers: tools.some((t) => t.access === "remember"),
    proposes: tools.some((t) => t.access === "propose"),
    never: ["Send, pay or delete anything on its own", "Use a tool you did not give it", "Quote a figure no tool returned without it being flagged by Veritas"],
    checks: ["Every step metered against the task's credit ceiling", "Every rupee figure checked by Veritas v1", "Every company source cited"],
  };
}

/* ------------------------------------------------------------------ drafting */

export function draftPrompt(description: string): string {
  const catalog = TOOL_CATALOG.map((t) => `- ${t.name}: ${t.plain} (${t.group})`).join("\n");
  return `A company wants a new specialist agent in its Cortex workspace. Design it from their description.

DESCRIPTION FROM THE COMPANY:
"""
${description}
"""

Choose the team: "finance", "operations" or "growth".
Choose ONLY tools from this list, and only the ones the job needs:
${catalog}

Reply with JSON only, no prose:
{"team":"finance|operations|growth","name":"short job title ending in Agent","role":"one line, what it does","instructions":"4-8 sentences: what to look up, how to judge it, what to report, when to propose an action","tools":["tool_name", "..."],"keywords":["5-10 words a request about this job would contain"]}`;
}

/** Parse the model's draft; anything unusable becomes null and the admin starts from a blank form. */
export function parseDraft(raw: string): Partial<AgentSpec> | null {
  const m = String(raw || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!j || typeof j !== "object") return null;
    return {
      team: TEAM_IDS.has(j.team) ? j.team : "finance",
      name: clean(j.name, LIMITS.name),
      role: clean(j.role, LIMITS.role),
      instructions: String(j.instructions ?? "").trim().slice(0, LIMITS.instructions),
      tools: (Array.isArray(j.tools) ? j.tools : []).map(String).filter((t: string) => TOOL_NAMES.has(t)),
      keywords: (Array.isArray(j.keywords) ? j.keywords : []).map((k: unknown) => clean(k, LIMITS.keyword).toLowerCase()).filter(Boolean),
    };
  } catch { return null; }
}
