/** MCP adapter (lib/api/mcp.ts) and the /ask snapshot, driven with a fake `call`. */
import { readFileSync } from "node:fs";
const M = await import("../src/lib/api/mcp.ts");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(n + (d ? `\n      ${d}` : "")));
const calls = [];
const call = async (method, path, query, body) => {
  calls.push({ method, path, query, body });
  if (path === "/api/v1/ask") return body.question === "fail" ? { status: 503, json: { ok: false, error: "The AI engine did not answer. Nothing was charged" } } : { status: 200, json: { ok: true, answer: "Cash is fine.", credits_charged: 19, request_id: "r" } };
  if (path === "/api/v1/invoices") return { status: 200, json: { ok: true, data: [{ invoice_no: "1" }], page: { limit: 50, next_cursor: null }, request_id: "r" } };
  return { status: 200, json: { ok: true, metrics: [], request_id: "r" } };
};
const ALL = ["metrics:read", "invoices:read", "customers:read", "sales:read", "ai:ask"];

let r = await M.handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, ALL, call);
check(r.result.protocolVersion === "2025-03-26" && r.result.capabilities.tools && r.result.serverInfo.name === "mnb-cortex", "initialize: echoes a supported version, declares tools");
r = await M.handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }, ALL, call);
check(r.result.protocolVersion === M.MCP_PROTOCOL_VERSIONS[0], "initialize: unknown version → our latest");
check((await M.handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ALL, call)) === null, "notification: no response");
r = await M.handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ALL, call);
check(r.result.tools.map((t) => t.name).join() === "get_metrics,list_invoices,list_customers,list_sales_orders,ask_cortex", "tools/list: all five for a full assistant key");
r = await M.handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ["connector:write"], call);
check(r.result.tools.length === 0, "tools/list: a Tally-bridge key sees no tools");
r = await M.handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ["metrics:read"], call);
check(r.result.tools.map((t) => t.name).join() === "get_metrics", "tools/list: filtered by the key's scopes");

r = await M.handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_invoices", arguments: { type: "receivable", status: "overdue", limit: 10, junk: "x" } } }, ALL, call);
const last = calls.at(-1);
check(last.path === "/api/v1/invoices" && last.query.type === "receivable" && last.query.status === "overdue" && last.query.limit === "10" && !("junk" in last.query), "tools/call: forwards only known filters to the REST handler");
check(!r.result.isError && /invoice_no/.test(r.result.content[0].text) && !("request_id" in r.result.structuredContent), "tools/call: data returned as text + structuredContent");
r = await M.handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "ask_cortex", arguments: { question: "How is cash?" } } }, ALL, call);
check(calls.at(-1).method === "POST" && calls.at(-1).body.question === "How is cash?" && /Cash is fine\.[\s\S]*19 credits used/.test(r.result.content[0].text), "ask_cortex: POSTs to /api/v1/ask and says what it cost");
r = await M.handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "ask_cortex", arguments: { question: "fail" } } }, ALL, call);
check(r.result.isError && /Nothing was charged/.test(r.result.content[0].text), "ask_cortex: engine failure is a tool error, not an answer");
const before = calls.length;
r = await M.handleRpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "ask_cortex", arguments: { question: "x" } } }, ["metrics:read"], call);
check(r.result.isError && calls.length === before, "tools/call: a scope the key lacks is refused before any call");
r = await M.handleRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "delete_everything" } }, ALL, call);
check(r.error?.code === -32602, "tools/call: unknown tool is a JSON-RPC error");
r = await M.handleRpc({ jsonrpc: "2.0", id: 8, method: "resources/list" }, ALL, call);
check(r.error?.code === -32601, "unknown method → -32601");
check((await M.handleRpc({ id: 1, method: "x" }, ALL, call)).error.code === -32600, "not JSON-RPC 2.0 → -32600");

/* Read-only by construction: no tool routes to a write endpoint. */
check(M.MCP_TOOLS.every((t) => t.route({ question: "q" }).path !== "/api/v1/ingest"), "no MCP tool can push data in");
const route = readFileSync(new URL("../src/app/api/mcp/route.ts", import.meta.url), "utf8");
check(!/\/api\/v1\/ingest/.test(route) && !/serviceClient|createClient/.test(route), "MCP route: no ingest handler, no direct database access");
check(/who\.status !== 200/.test(route) && /WWW-Authenticate/.test(route), "MCP route: a bad key is an HTTP 401");

/* /ask */
const ask = readFileSync(new URL("../src/lib/api/ask.ts", import.meta.url), "utf8");
check(/chargeOrgForMode\(orgId, ASK_MODE\)/.test(ask) && /ASK_MODE = "ask"/.test(ask), "ask: charged through the shared meter at the 'ask' price");
check(/tools: false/.test(ask), "ask: no tools — an API caller cannot make Cortex act");
check((ask.match(/refundIfCharged\(gate, ASK_MODE\)/g) || []).length >= 2 && /isEngineFailure\(answer\)/.test(ask), "ask: engine failure and exceptions are refunded");
const C = await import("../src/lib/config.ts");
check(C.creditCost("ask") === C.creditCost("chat"), "ask: same price as chat in the app");

if (failures.length) { console.error(`\nmcp: ${pass} passed, ${failures.length} failed`); for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
console.log(`mcp: ${pass} passed, 0 failed`);
