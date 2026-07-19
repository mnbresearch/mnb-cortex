"use server";
import { revalidatePath } from "next/cache";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { MY_BUSINESSES } from "@/lib/config";

async function assertSuper() {
  if (!(await isSuperAdmin())) throw new Error("Not authorised — platform super-admin only.");
}

/**
 * Creates the portfolio workspaces (MNB Research, Approbot) if they don't exist
 * and makes the signed-in super-admin the owner of each.
 * NOTE: this only creates the workspace + profile. Business figures must be
 * imported from real sources — nothing is invented.
 */
export async function provisionBusinesses() {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error("Sign in first.");

  for (const b of MY_BUSINESSES) {
    const { data: existing } = await sb.from("organizations").select("id").ilike("name", b.name).limit(1).maybeSingle();
    let orgId = (existing as any)?.id as string | undefined;
    if (!orgId) {
      const { data: created, error } = await sb.from("organizations")
        .insert({ name: b.name, industry: b.industry, currency: "INR", plan: "premium", accent: "teal" })
        .select("id").single();
      if (error) throw new Error(`Could not create ${b.name}: ${error.message}`);
      orgId = (created as any).id;
    }
    // ensure the super-admin owns it
    const { data: mem } = await sb.from("memberships").select("id").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (!mem) await sb.from("memberships").insert({ org_id: orgId, user_id: user.id, role: "owner" });
  }
  revalidatePath("/superadmin");
  return { ok: true };
}

/** Super-admin grants a person access to any organization (via invite, works pre-signup). */
export async function grantOrgAccess(fd: FormData) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  const org_id = String(fd.get("org_id") || "");
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const role = String(fd.get("role") || "admin");
  if (!org_id || !email) throw new Error("Organization and email are required.");
  const { error } = await sb.from("invites").insert({ org_id, email, role, status: "pending" });
  if (error) throw new Error(error.message);
  revalidatePath("/superadmin");
  return { ok: true };
}

/** Switch which workspace the super-admin is currently viewing (adds membership if missing). */
export async function joinOrg(fd: FormData) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  const org_id = String(fd.get("org_id") || "");
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !org_id) throw new Error("Missing user or organization.");
  const { data: mem } = await sb.from("memberships").select("id").eq("org_id", org_id).eq("user_id", user.id).maybeSingle();
  if (!mem) await sb.from("memberships").insert({ org_id, user_id: user.id, role: "owner" });
  revalidatePath("/superadmin");
  return { ok: true };
}
