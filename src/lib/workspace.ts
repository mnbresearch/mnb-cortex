import "server-only";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/credits";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/config";


/**
 * Ensure the signed-in user has a workspace. Called after every sign-in
 * (password, magic-link or Google) so a brand-new customer lands in a real,
 * working workspace instead of an empty app.
 *
 * - Reads the user from the cookie session (secure), then uses the service role
 *   to create the org + owner membership (bypasses RLS for the bootstrap).
 * - Idempotent: if the user is already a member of any workspace, it's a no-op.
 * - Starts a 3-day trial and grants the one-time trial credits.
 */
export async function ensureWorkspace(opts?: { name?: string; industry?: string }): Promise<{ ok: boolean; orgId?: string; created?: boolean; joined?: number; error?: string }> {
  const anon = createClient();
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Service role not configured." };

  const meta: any = user.user_metadata || {};
  const wantName = String(opts?.name || meta.company || "").slice(0, 80).trim();

  // ---- Claim any pending invitations for this email FIRST -------------------
  // Nothing turned an invite into a membership, so invited teammates — and
  // customers provisioned by a super-admin — signed up into a brand-new empty
  // workspace while the inviter's screen said "pending" forever.
  //
  // This runs on every sign-in, not just signup, so someone who is invited
  // after they already have an account joins on their next visit. RLS hides an
  // invite from its own recipient, so this must use the service role.
  const joined = await claimInvites(svc, user.id, user.email || "");

  // A DB signup trigger may already have created a workspace. Reuse it if so;
  // otherwise create one. Either way we then ensure it's fully provisioned.
  const { data: mems } = await svc.from("memberships").select("org_id").eq("user_id", user.id).limit(1);
  let orgId = (mems && mems.length) ? String((mems[0] as any).org_id) : "";
  let created = false;

  // Joining an existing workspace is enough — don't also mint an empty personal
  // one, which is what made a provisioned customer land in the wrong place.
  if (orgId && joined > 0) return { ok: true, orgId, created: false, joined };

  if (!orgId) {
    const name = wantName || meta.full_name || (user.email || "").split("@")[0] || "My workspace";
    const { data: org, error } = await svc.from("organizations")
      .insert({ name, industry: opts?.industry || meta.industry || null, currency: "INR", plan: "starter", accent: "gold" })
      .select("id").single();
    if (error || !org) return { ok: false, error: error?.message || "Could not create your workspace." };
    orgId = String((org as any).id);
    created = true;
    await svc.from("memberships").insert({ org_id: orgId, user_id: user.id, role: "owner" });
  }

  // Rename a generic trigger-created workspace to the name the user actually typed.
  if (wantName) {
    try {
      const { data: o } = await svc.from("organizations").select("name").eq("id", orgId).single();
      const cur = String((o as any)?.name || "");
      if (/^my (company|workspace|business)$/i.test(cur) && wantName.toLowerCase() !== cur.toLowerCase()) {
        await svc.from("organizations").update({ name: wantName }).eq("id", orgId);
      }
    } catch { /* ignore */ }
  }

  // Ensure a trial window + status if not already set (migration-safe).
  try {
    const { data: o } = await svc.from("organizations").select("trial_ends_at, subscription_status").eq("id", orgId).single();
    if (!(o as any)?.trial_ends_at) {
      await svc.from("organizations").update({
        subscription_status: (o as any)?.subscription_status || "trialing",
        trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
      }).eq("id", orgId);
    }
  } catch { /* ignore */ }

  // Profile row (best-effort).
  // Only write full_name when we actually have one. This runs on EVERY sign-in,
  // so passing null overwrote the value the signup trigger seeded (which falls
  // back to the email address) for anyone signing in without name metadata.
  try {
    const row: any = { id: user.id };
    const fullName = String(meta.full_name || "").trim();
    if (fullName) row.full_name = fullName;
    await svc.from("profiles").upsert(row);
  } catch { /* ignore */ }

  // One-time trial credits — granted exactly once (guarded by the ledger reason).
  try {
    const { data: prior } = await svc.from("credit_ledger").select("id").eq("org_id", orgId).eq("reason", "trial_grant").limit(1);
    if (!prior || !prior.length) await grantCredits(orgId, TRIAL_CREDITS, "trial_grant", user.id);
  } catch { /* ignore */ }

  return { ok: true, orgId, created, joined };
}

/**
 * Turn every pending invite for `email` into a real membership.
 * Returns how many workspaces the user just joined.
 *
 * Idempotent: an already-accepted invite is skipped, and a user who is already
 * a member of the target org is not duplicated.
 */
async function claimInvites(svc: any, userId: string, email: string): Promise<number> {
  const addr = email.trim().toLowerCase();
  if (!addr) return 0;
  try {
    // ilike() does NOT escape LIKE metacharacters, and `_` is common in email
    // local-parts — an invite to john_doe@acme.com would otherwise be claimable
    // by johnXdoe@acme.com. Escape for the query AND re-verify exactly in JS.
    const pattern = addr.replace(/([\\%_])/g, "\\$1");
    const { data: invites } = await svc
      .from("invites").select("id, org_id, role, email").ilike("email", pattern).eq("status", "pending");
    const list = ((invites as any[]) || []).filter((i) => String(i.email || "").trim().toLowerCase() === addr);
    if (!list.length) return 0;

    const { data: existing } = await svc.from("memberships").select("org_id").eq("user_id", userId);
    const already = new Set(((existing as any[]) || []).map((m) => String(m.org_id)));

    let n = 0;
    for (const inv of list) {
      const orgId = String(inv.org_id);
      let ok = already.has(orgId);
      if (!ok) {
        const { error } = await svc.from("memberships")
          .insert({ org_id: orgId, user_id: userId, role: inv.role || "analyst" });
        // 23505 = unique violation: a concurrent sign-in already added them.
        ok = !error || error.code === "23505";
        if (ok) { n++; already.add(orgId); }
      }
      // Only consume the invite once the membership actually exists. Marking it
      // accepted after a real failure would strand the user outside the org
      // while the inviter's screen reads "accepted".
      if (ok) await svc.from("invites").update({ status: "accepted" }).eq("id", inv.id);
    }
    return n;
  } catch {
    return 0; // never block sign-in on invite processing
  }
}
