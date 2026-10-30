/*
  MCP — the Model Context Protocol, so Claude, ChatGPT, Cursor and any other
  MCP client can use Cortex as a tool with a Cortex API key. This is also how
  Wispr Flow users get to Cortex: Wispr Flow dictates into whatever app is in
  front, so an assistant that has Cortex as a tool can be asked by voice.

  A THIN ADAPTER, NOT A SECOND API. Every tool call is forwarded to the
  existing /api/v1 handler with the caller's own Authorization header, so
  scopes, plan gates, rate limits, usage counting, credit charging and refunds
  are the ones the REST API already enforces. Nothing here touches the
  database.

  Pure (no server imports): the protocol handling is tested directly by
  scripts/test-mcp.mjs with a fake `call`.
*/

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type ToolDef = {
  name: string;
  description: string;
  scope: string;
  inputSchema: Record<string, unknown>;
  /** Which v1 endpoint serves it, and how arguments become a request. */
  route: (args: Record<string, any>) => { method: "GET" | "POST"; path: string; query?: Record<string, string>; body?: unknown };
};

const str = { type: "string" } as const;
const lim = { type: "integer", minimum: 1, maximum: 200, description: "How many to return (default 50)" } as const;
const q = (args: Record<string, any>, keys: string[]) => {
  const out: Record<string, string> = {};
  for (const k of keys) if (args[k] !== undefined && args[k] !== null && args[k] !== "") out[k] = String(args[k]);
  return out;
};

export const MCP_TOOLS: ToolDef[] = [
  { name: "get_metrics", scope: "metrics:read",
    description: "The workspace's live KPIs — revenue, cash, receivables, margins — each with its status (green/yellow/red).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    route: () => ({ method: "GET", path: "/api/v1/metrics" }) },
  { name: "list_invoices", scope: "invoices:read",
    description: "Invoices: receivable (customers owe us) or payable (we owe suppliers), filterable by status and due date.",
    inputSchema: { type: "object", properties: { type: { enum: ["receivable", "payable"] }, status: { enum: ["pending", "overdue", "paid"] }, due_from: { ...str, description: "YYYY-MM-DD" }, due_to: { ...str, description: "YYYY-MM-DD" }, limit: lim, cursor: str }, additionalProperties: false },
    route: (a) => ({ method: "GET", path: "/api/v1/invoices", query: q(a, ["type", "status", "due_from", "due_to", "limit", "cursor"]) }) },
  { name: "list_customers", scope: "customers:read",
    description: "Customers in the workspace's CRM.",
    inputSchema: { type: "object", properties: { status: str, limit: lim, cursor: str }, additionalProperties: false },
    route: (a) => ({ method: "GET", path: "/api/v1/customers", query: q(a, ["status", "limit", "cursor"]) }) },
  { name: "list_sales_orders", scope: "sales:read",
    description: "Sales orders, newest first.",
    inputSchema: { type: "object", properties: { status: { enum: ["won", "open", "lost"] }, from: { ...str, description: "ordered on or after, YYYY-MM-DD" }, to: { ...str, description: "ordered on or before, YYYY-MM-DD" }, limit: lim, cursor: str }, additionalProperties: false },
    route: (a) => ({ method: "GET", path: "/api/v1/sales-orders", query: q(a, ["status", "from", "to", "limit", "cursor"]) }) },
  { name: "ask_cortex", scope: "ai:ask",
    description: "Ask Cortex, the AI COO, a question about this business in plain language. Charged in credits like chat in the app; refunded if the engine does not answer.",
    inputSchema: { type: "object", properties: { question: { ...str, description: "The question, in plain language" } }, required: ["question"], additionalProperties: false },
    route: (a) => ({ method: "POST", path: "/api/v1/ask", body: { question: String(a.question ?? "") } }) },
];

export type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };
export type Call = (method: "GET" | "POST", path: string, query?: Record<string, string>, body?: unknown) => Promise<{ status: number; json: any }>;

const ok = (id: any, result: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, result });
const err = (id: any, code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

/**
 * One JSON-RPC message → a response (or null for a notification).
 * `scopes` are the key's own (from whoami); a tool the key cannot use is not listed.
 */
export async function handleRpc(msg: Rpc, scopes: string[], call: Call) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return err(msg?.id, -32600, "Invalid request");
  const isNote = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion || "");
      const version = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];
      return ok(msg.id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mnb-cortex", title: "MNB Cortex — AI COO", version: "1.0.0" },
        instructions: "Tools read this workspace's live business data (KPIs, invoices, customers, sales). ask_cortex answers questions in plain language and costs credits. Nothing here can send messages or change data.",
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: MCP_TOOLS.filter((t) => scopes.includes(t.scope)).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const name = String(msg.params?.name || "");
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (!tool) return err(msg.id, -32602, `Unknown tool: ${name.slice(0, 60)}`);
      if (!scopes.includes(tool.scope)) {
        return ok(msg.id, { isError: true, content: [{ type: "text", text: `This API key does not have the ${tool.scope} permission. Create a key with the "AI assistant" preset under Developers.` }] });
      }
      const args = msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {};
      const r = tool.route(args);
      const res = await call(r.method, r.path, r.query, r.body);
      const j = res.json || {};
      if (res.status >= 400 || j.ok === false) {
        return ok(msg.id, { isError: true, content: [{ type: "text", text: String(j.error || `Cortex returned ${res.status}`) }] });
      }
      const { ok: _o, request_id: _r, ...payload } = j;
      const text = tool.name === "ask_cortex" ? String(payload.answer || "") + (payload.credits_charged ? `\n\n(${payload.credits_charged} credits used)` : "") : JSON.stringify(payload, null, 2);
      return ok(msg.id, { content: [{ type: "text", text }], structuredContent: tool.name === "ask_cortex" ? undefined : payload });
    }
    default:
      return isNote ? null : err(msg.id, -32601, `Method not found: ${msg.method.slice(0, 60)}`);
  }
}
