import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { syncProvider, isSyncable } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Pull data from one connected integration on demand. Admins only. */
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return NextResponse.json({ ok: false, error: "Sign in to sync." }, { status: 401 });

  const sb = createClient();
  const { data: mem } = await sb.from("memberships").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  const rank: Record<string, number> = { viewer: 1, analyst: 2, manager: 3, admin: 4, owner: 5 };
  if ((rank[(mem as any)?.role] || 0) < rank.admin) {
    return NextResponse.json({ ok: false, error: "Only workspace admins can sync integrations." }, { status: 403 });
  }

  const { provider } = await req.json().catch(() => ({} as any));
  if (!isSyncable(String(provider || ""))) {
    return NextResponse.json({ ok: false, error: `${provider} doesn't support automatic data sync yet.` }, { status: 200 });
  }

  const result = await syncProvider(orgId, String(provider));
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
