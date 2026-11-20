import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { serviceClient } from "@/lib/supabase/server";
import { asRoutingMode, ROUTING_MODES, ROUTING_LABEL, routeOrder, PROVIDER_LABEL } from "@/lib/ai/routing";
import { envKey } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/*
  Model Router setting (organizations.ai_routing). GET shows the mode and which
  providers the platform can serve; PUT {mode} is admin-only. Which provider is
  billed follows automatically: firstServingProvider() reads the same mode.
*/
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  let mode = "auto", ready = true;
  try {
    const { data, error } = await (serviceClient() as any).from("organizations").select("ai_routing").eq("id", orgId).maybeSingle();
    if (error) ready = false; else mode = asRoutingMode((data as any)?.ai_routing);
  } catch { ready = false; }
  const platform = { gemini: !!envKey("GEMINI_API_KEY"), groq: !!envKey("GROQ_API_KEY"), xai: !!(envKey("XAI_API_KEY") || envKey("GROK_API_KEY")), anthropic: !!envKey("ANTHROPIC_API_KEY"), openai: !!envKey("OPENAI_API_KEY") };
  return NextResponse.json({
    ok: true, ready, mode, canEdit: await hasRole("admin"),
    modes: ROUTING_MODES.map((m) => ({ id: m, ...ROUTING_LABEL[m], order: routeOrder(m).map((p) => ({ id: p, label: PROVIDER_LABEL[p], platform: (platform as any)[p] })) })),
  });
}

export async function PUT(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("admin"))) return NextResponse.json({ ok: false, error: "Only workspace admins can change model routing." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  if (!(ROUTING_MODES as string[]).includes(String(b.mode))) return NextResponse.json({ ok: false, error: "Unknown routing mode." }, { status: 400 });
  const { data: saved, error } = await (serviceClient() as any).from("organizations").update({ ai_routing: b.mode }).eq("id", orgId).select("id");
  if (!error && !(saved as any[])?.length) return NextResponse.json({ ok: false, error: "Workspace not found." }, { status: 404 });
  if (error) return NextResponse.json({ ok: false, error: "Model routing needs its column: run supabase/RUN-2026-11-20-model-router.sql." }, { status: 503 });
  return NextResponse.json({ ok: true, mode: b.mode });
}
