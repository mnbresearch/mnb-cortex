import { NextResponse } from "next/server";
import { createClient, hasSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Switch the active workspace. Only allowed for orgs the user is a member of. */
export async function POST(req: Request) {
  try {
    if (!hasSupabase()) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 200 });
    const { org_id } = await req.json().catch(() => ({ org_id: "" }));
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const { data: mem } = await sb.from("memberships").select("id").eq("user_id", user.id).eq("org_id", String(org_id)).maybeSingle();
    if (!mem) return NextResponse.json({ ok: false, error: "You are not a member of that workspace" }, { status: 403 });

    const res = NextResponse.json({ ok: true });
    /*
      `secure` added: this is now the main way a Practice firm moves between
      client workspaces, so it is set far more often than when it was only a
      rare manual switch. Membership is still re-verified server-side on every
      read (lib/data.ts), so a forged value grants nothing — but there is no
      reason to let it travel in clear text either.
    */
    res.cookies.set("cortex_org", String(org_id), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
