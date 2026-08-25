import "server-only";
import { getUserAndOrg } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/**
 * Workspace role checks.
 *
 * Lifted out of actions.ts, which carries "use server" — everything exported
 * from that file has to be an async server action, so it could not be shared
 * with route handlers or pages that need the same check. Two copies of an
 * authorisation rule is how one of them ends up wrong.
 */
export const ROLE_RANK: Record<string, number> = { viewer: 1, analyst: 2, manager: 3, admin: 4, owner: 5 };

export async function currentRole(): Promise<{ orgId: string | null; role: string }> {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) return { orgId: null, role: "viewer" };
  const sb = createClient();
  const { data } = await sb.from("memberships").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  return { orgId, role: (data as any)?.role || "viewer" };
}

/** True when the signed-in user meets `min` in this workspace. Never throws. */
export async function hasRole(min: string): Promise<boolean> {
  const { orgId, role } = await currentRole();
  if (!orgId) return false;
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);
}

/** Throwing variant, for write paths that should abort. */
export async function assertRole(min: string): Promise<{ orgId: string; role: string }> {
  const { orgId, role } = await currentRole();
  if (!orgId) throw new Error("Sign in to use this feature.");
  if ((ROLE_RANK[role] || 0) < (ROLE_RANK[min] || 0)) {
    throw new Error(`This action requires the ${min} role or higher (you are ${role}).`);
  }
  return { orgId, role };
}
