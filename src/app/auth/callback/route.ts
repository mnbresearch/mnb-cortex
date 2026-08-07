import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/workspace";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";
  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
    // Make sure every newly-verified user has a workspace + trial before landing.
    try { await ensureWorkspace(); } catch { /* non-fatal */ }
  }
  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/dashboard"}`);
}
