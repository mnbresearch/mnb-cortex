import { NextResponse } from "next/server";
import { handleRpc, type Call } from "@/lib/api/mcp";
import { GET as whoami } from "@/app/api/v1/whoami/route";
import { GET as metrics } from "@/app/api/v1/metrics/route";
import { GET as invoices } from "@/app/api/v1/invoices/route";
import { GET as customers } from "@/app/api/v1/customers/route";
import { GET as salesOrders } from "@/app/api/v1/sales-orders/route";
import { POST as ask } from "@/app/api/v1/ask/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  POST /api/mcp — MCP over Streamable HTTP (JSON responses, stateless).

  Connect from any MCP client with:
    URL     https://cortex.mnbresearch.com/api/mcp
    Header  Authorization: Bearer <a Cortex key with the "AI assistant" preset>

  Every tool call is the matching /api/v1 handler, invoked in-process with the
  caller's own key (lib/api/mcp.ts) — the REST API's scopes, plan gates, rate
  limits and credit metering apply unchanged.
*/

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  "GET /api/v1/metrics": metrics,
  "GET /api/v1/invoices": invoices,
  "GET /api/v1/customers": customers,
  "GET /api/v1/sales-orders": salesOrders,
  "POST /api/v1/ask": ask,
};

function forward(req: Request): Call {
  const auth: Record<string, string> = {};
  for (const h of ["authorization", "x-api-key"]) { const v = req.headers.get(h); if (v) auth[h] = v; }
  return async (method, path, query, body) => {
    const fn = HANDLERS[`${method} ${path}`];
    if (!fn) return { status: 404, json: { ok: false, error: "No such endpoint." } };
    const url = new URL(path, req.url);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const inner = new Request(url, { method, headers: { ...auth, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const res = await fn(inner);
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
}

export async function POST(req: Request) {
  let payload: any;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }

  /* The key first, once per request: a bad key is an HTTP 401 the client can show, not a JSON-RPC error inside a 200. */
  const who = await whoami(new Request(new URL("/api/v1/whoami", req.url), { headers: Object.fromEntries(["authorization", "x-api-key"].map((h) => [h, req.headers.get(h) || ""]).filter(([, v]) => v)) }));
  if (who.status !== 200) {
    const j: any = await who.json().catch(() => ({}));
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: j.error || "Unauthorised" } }, { status: who.status, headers: { "WWW-Authenticate": 'Bearer realm="mnb-cortex"' } });
  }
  const scopes: string[] = ((await who.json()) as any)?.data?.key?.scopes || [];
  const call = forward(req);

  const batch = Array.isArray(payload);
  const msgs = batch ? payload : [payload];
  if (!msgs.length || msgs.length > 20) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Send 1–20 messages." } }, { status: 400 });
  const out = [];
  for (const m of msgs) { const r = await handleRpc(m, scopes, call); if (r) out.push(r); }
  if (!out.length) return new Response(null, { status: 202 });
  return NextResponse.json(batch ? out : out[0], { headers: { "Cache-Control": "no-store" } });
}

/* No server-initiated stream: this server never pushes, so GET is refused as the spec allows. */
export async function GET() {
  return new Response("This MCP endpoint answers POST only (Streamable HTTP, JSON responses).", { status: 405, headers: { Allow: "POST" } });
}
