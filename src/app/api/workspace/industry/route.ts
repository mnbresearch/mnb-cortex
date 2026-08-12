import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { INDUSTRIES } from "@/lib/agents/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sets the workspace's industry from the first-run prompt.
export async function POST(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in first." });
  const { industry } = await req.json().catch(() => ({}));
  const id = String(industry || "").toLowerCase().trim();
  if (!INDUSTRIES.some((i) => i.id === id)) return NextResponse.json({ ok: false, error: "Unknown industry." });
  const sb = createClient();
  const { error } = await sb.from("organizations").update({ industry: id }).eq("id", orgId);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true, industry: id });
}
