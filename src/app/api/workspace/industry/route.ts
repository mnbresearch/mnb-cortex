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
  // The org UPDATE policy requires admin or owner. For anyone below that the
  // update matches zero rows, PostgREST returns 204 with NO error, and this
  // route used to answer `{ ok: true }` while nothing had been written.
  // Asking for the changed row back makes the failure visible.
  const sb = createClient();
  const { data, error } = await sb
    .from("organizations").update({ industry: id }).eq("id", orgId).select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message });
  if (!data?.length) {
    return NextResponse.json({ ok: false, error: "Only an admin or owner can change the workspace industry." });
  }
  return NextResponse.json({ ok: true, industry: id });
}
