import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { appsReady, orgAppSummary, saveOrgApp, deleteOrgApp, type AppProvider } from "@/lib/knowledge/apps";
import { sharedClient, appBase, redirectUri } from "@/lib/knowledge/oauth";
import { orgCapability } from "@/lib/engine/plan-gate-server";
import { MICROSOFT_SCOPES, GOOGLE_SCOPES } from "@/lib/knowledge/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Settings → Company Knowledge connections. Admin only: these credentials let
  Cortex read the company's mail.
    GET     — for each provider: is Cortex's shared app available, is the
              company's own app saved (client id only — never the secret),
              the redirect URI to register, and the exact permissions.
    PUT     — { provider, clientId, clientSecret, tenant? } save the company's own app
    DELETE  — { provider } go back to Cortex's shared app
*/
const PROVIDERS: AppProvider[] = ["microsoft365", "google_workspace"];

async function guard() {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return { error: NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 }) };
  if (!(await hasRole("admin"))) return { error: NextResponse.json({ ok: false, error: "Only workspace admins can manage connection settings." }, { status: 403 }) };
  return { user, orgId };
}

export async function GET(req: Request) {
  const g = await guard(); if ("error" in g) return g.error;
  const ready = await appsReady();
  const cap = await orgCapability(g.orgId, "workspace_connectors");
  const base = appBase(req);
  const out: Record<string, unknown> = {};
  for (const p of PROVIDERS) {
    out[p] = {
      shared: Boolean(sharedClient(p)),
      own: ready ? await orgAppSummary(g.orgId, p) : { saved: false, clientId: null, tenant: null, updatedAt: null },
      redirectUri: redirectUri(base, p),
      permissions: p === "microsoft365" ? MICROSOFT_SCOPES.filter((s) => !["openid", "email"].includes(s)) : GOOGLE_SCOPES.filter((s) => s.startsWith("https://")),
    };
  }
  return NextResponse.json({ ok: true, ready, allowedByPlan: cap.verdict.ok, providers: out });
}

export async function PUT(req: Request) {
  const g = await guard(); if ("error" in g) return g.error;
  if (!(await appsReady())) return NextResponse.json({ ok: false, error: "Run supabase/RUN-2026-11-20-knowledge-apps.sql in Supabase first." }, { status: 503 });
  const cap = await orgCapability(g.orgId, "workspace_connectors");
  if (!cap.verdict.ok) return NextResponse.json({ ok: false, error: "Microsoft 365 and Google Workspace connections are part of the Command and Enterprise plans." }, { status: 402 });
  const b = await req.json().catch(() => ({} as any));
  const p = String(b.provider) as AppProvider;
  if (!PROVIDERS.includes(p)) return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  const r = await saveOrgApp(g.orgId, g.user.id, p, { clientId: b.clientId, clientSecret: b.clientSecret, tenant: b.tenant });
  return NextResponse.json(r.ok ? { ok: true } : r, { status: r.ok ? 200 : 400 });
}

export async function DELETE(req: Request) {
  const g = await guard(); if ("error" in g) return g.error;
  const b = await req.json().catch(() => ({} as any));
  const p = String(b.provider) as AppProvider;
  if (!PROVIDERS.includes(p)) return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  return NextResponse.json({ ok: await deleteOrgApp(g.orgId, p) });
}
