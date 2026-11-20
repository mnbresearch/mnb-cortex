import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { PROVIDERS, allowableTools } from "@/lib/knowledge/core";
import { listSources, getSource, createSource, updateSource, deleteSource, knowledgeReady, KNOWLEDGE_SETUP, knowledgeStats } from "@/lib/knowledge/store";
import { configured } from "@/lib/knowledge/oauth";
import { mayConnect, capabilityFor } from "@/lib/knowledge/access";
import { orgCapability } from "@/lib/engine/plan-gate-server";
import { discoverTools } from "@/lib/knowledge/mcp-client";
import { syncSource } from "@/lib/knowledge/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
  Company Knowledge sources.
    GET    — sources, what each provider needs, what the plan allows
    POST   — connect an MCP server: { url, token?, label? }
    PATCH  — { id, action: sync | pause | resume | delete | allow, allowed?: string[] }
  Connecting and changing sources is admin and above: a source can read a
  company's mail. Everyone in the workspace can see which sources exist.
*/
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await knowledgeReady())) return NextResponse.json({ ok: false, setup: true, error: KNOWLEDGE_SETUP });
  const [sources, stats, canManage, k, w] = await Promise.all([
    listSources(orgId), knowledgeStats(orgId), hasRole("admin"),
    orgCapability(orgId, "knowledge"), orgCapability(orgId, "workspace_connectors"),
  ]);
  const plan = { knowledge: k.verdict.ok, workspace_connectors: w.verdict.ok };
  const providers = PROVIDERS.map((p) => ({
    ...p, allowedByPlan: plan[capabilityFor(p.id)],
    configured: p.id === "microsoft365" || p.id === "google_workspace" ? configured(p.id) : true,
  }));
  return NextResponse.json({ ok: true, sources, stats, providers, canManage });
}

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("admin"))) return NextResponse.json({ ok: false, error: "Connecting company sources needs the admin role." }, { status: 403 });
  const gate = await mayConnect(orgId, "mcp");
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: 402 });
  const b = await req.json().catch(() => ({} as any));
  const url = String(b.url || "").trim();
  if (!/^https:\/\//i.test(url)) return NextResponse.json({ ok: false, error: "Give the MCP server's https:// URL." }, { status: 400 });
  const token = String(b.token || "").trim() || null;
  let found;
  try { found = await discoverTools(url, token); }
  catch (e: any) { return NextResponse.json({ ok: false, error: `Could not connect: ${String(e?.message || e).slice(0, 200)}` }, { status: 400 }); }
  const readable = allowableTools(found.tools).map((t) => ({ name: t.name, description: t.description }));
  const r = await createSource({
    orgId, userId: user.id, provider: "mcp", label: String(b.label || found.server).slice(0, 80), account: new URL(url).host,
    scopes: ["tools"], config: { url, server: found.server, tools: readable, allowed: readable.map((t) => t.name), refused: found.tools.length - readable.length },
    secret: token,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  await updateSource(orgId, r.source.id, { status_reason: `${readable.length} read-only tool(s) allowed. ${found.tools.length - readable.length} tool(s) that can change data were left off.` } as any);
  return NextResponse.json({ ok: true, source: r.source });
}

export async function PATCH(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("admin"))) return NextResponse.json({ ok: false, error: "Changing company sources needs the admin role." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const source = await getSource(orgId, String(b.id || ""));
  if (!source) return NextResponse.json({ ok: false, error: "No such source." }, { status: 404 });
  switch (String(b.action)) {
    case "delete":
      return NextResponse.json({ ok: await deleteSource(orgId, source.id) });
    case "pause":
      await updateSource(orgId, source.id, { status: "paused", status_reason: "Paused. Nothing new is read; what was read stays searchable." } as any);
      return NextResponse.json({ ok: true });
    case "resume":
      await updateSource(orgId, source.id, { status: "active", next_sync_at: new Date().toISOString() } as any);
      return NextResponse.json({ ok: true });
    case "sync": {
      const r = await syncSource(source);
      return NextResponse.json({ ok: r.ok, written: r.written, note: r.note, error: r.ok ? undefined : r.note });
    }
    case "allow": {
      if (source.provider !== "mcp") return NextResponse.json({ ok: false, error: "Only MCP sources have tools to allow." }, { status: 400 });
      const offered = new Set(((source.config?.tools as any[]) || []).map((t) => t.name));
      const allowed = (Array.isArray(b.allowed) ? b.allowed : []).map(String).filter((n: string) => offered.has(n));
      await updateSource(orgId, source.id, { config: { ...source.config, allowed }, status_reason: `${allowed.length} tool(s) allowed.` } as any);
      return NextResponse.json({ ok: true, allowed });
    }
    default:
      return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
}
