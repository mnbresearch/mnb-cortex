import "server-only";
import { safeFetch } from "@/lib/net-guard";
import { parseMcpBody, mcpResultText, type McpTool } from "@/lib/knowledge/core";

/*
  A minimal MCP client (Streamable HTTP) for connecting a company's own
  systems to Cortex: initialize → tools/list, and tools/call for the
  read-only tools the owner allowed.

  Every request goes through safeFetch (lib/net-guard.ts), which refuses
  private, loopback and cloud-metadata addresses before any token is sent —
  an MCP URL is typed by a customer and must never become a way to reach
  inside our own network.
*/

const PROTOCOL = "2025-06-18";

type Session = { url: string; token: string | null; sessionId: string | null };

async function rpc(s: Session, method: string, params: unknown, id: number | null): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": PROTOCOL };
  if (s.token) headers.Authorization = `Bearer ${s.token}`;
  if (s.sessionId) headers["Mcp-Session-Id"] = s.sessionId;
  const body = JSON.stringify(id === null ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params });
  const r = await safeFetch(s.url, { method: "POST", headers, body, timeoutMs: 25_000 });
  const sid = r.headers.get("mcp-session-id");
  if (sid) s.sessionId = sid;
  if (id === null) return null;
  if (r.status === 401 || r.status === 403) throw new Error("The MCP server refused the token.");
  if (!r.ok) throw new Error(`The MCP server returned HTTP ${r.status}.`);
  const parsed = parseMcpBody(r.headers.get("content-type") || "", await r.text());
  if (!parsed) throw new Error("The MCP server's answer could not be read.");
  if (parsed.error) throw new Error(String(parsed.error.message || "MCP error").slice(0, 300));
  return parsed.result;
}

async function open(url: string, token: string | null): Promise<{ s: Session; info: any }> {
  const s: Session = { url, token, sessionId: null };
  const info = await rpc(s, "initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "cortex", title: "Cortex by MNB Research", version: "1.0.0" } }, 1);
  await rpc(s, "notifications/initialized", {}, null).catch(() => null);
  return { s, info };
}

export async function discoverTools(url: string, token: string | null): Promise<{ server: string; tools: McpTool[] }> {
  const { s, info } = await open(url, token);
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = await rpc(s, "tools/list", cursor ? { cursor } : {}, 2 + i);
    for (const t of r?.tools || []) tools.push({ name: String(t.name), description: String(t.description || "").slice(0, 500), inputSchema: t.inputSchema, annotations: t.annotations });
    cursor = r?.nextCursor; if (!cursor) break;
  }
  return { server: String(info?.serverInfo?.title || info?.serverInfo?.name || new URL(url).hostname), tools };
}

export async function callTool(url: string, token: string | null, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  const { s } = await open(url, token);
  const r = await rpc(s, "tools/call", { name, arguments: args || {} }, 10);
  return { ok: !r?.isError, text: mcpResultText(r) };
}
