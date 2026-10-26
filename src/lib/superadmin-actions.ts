import "server-only";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { MY_BUSINESSES, PLANS } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { renderBrandedEmail, brandFrom, brandReplyTo } from "@/lib/branded-email";
import {
  calculateDemoExpiry,
  generateDemoWelcomeEmail,
  DEMO_PRESETS,
  type DemoPresetId,
  DEMO_DEFAULT_STARTING_CREDITS,
  DEMO_TRIAL_DURATION_DAYS,
} from "@/lib/demo-workspace";
import { seedDemoWorkspace } from "@/lib/demo-seeder";

// Plain server helpers (NOT server actions) — called from /api/superadmin.

async function assertSuper() {
  if (!(await isSuperAdmin())) throw new Error("Not authorised — platform super-admin only.");
}

/**
 * Creates the portfolio workspaces (MNB Research, Approbot) if missing and makes
 * the signed-in super-admin the owner. Creates the workspace + profile only —
 * real business figures must be imported; nothing is invented.
 */
/**
 * Stop, or resume, ALL outbound collections messaging.
 *
 * The one control that exists for us rather than for a customer. Collections
 * messages people who never signed up for Cortex, so there has to be a way to
 * halt it in seconds — from a browser, by a person who is not deploying — if it
 * starts behaving badly for anyone.
 *
 * Deliberately global rather than per-workspace: if something is wrong with how
 * Cortex writes or when it sends, it is wrong everywhere, and picking through
 * workspaces one at a time during an incident is how the incident gets longer.
 */
export async function setCollectionsSwitch(fd: FormData): Promise<{ ok: boolean; on?: boolean; error?: string }> {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Service role not configured." };
  const on = String(fd.get("on") || "") === "1";
  const reason = String(fd.get("reason") || "").trim().slice(0, 200);
  try {
    const { error } = await sb.rpc("cortex_set_collections_switch", { p_on: on, p_reason: reason || null });
    if (error) return { ok: false, error: error.message };
    return { ok: true, on };
  } catch (e: any) { return { ok: false, error: e?.message || "Could not flip the switch." }; }
}

/**
 * Abandoned-checkout follow-up: off / dry_run / live. Defaults to dry_run in
 * the migration; going live is a deliberate operator act after reading the
 * preview and sending themselves a test.
 */
export async function setCheckoutFollowupMode(mode: string): Promise<{ ok: boolean; mode?: string; error?: string }> {
  await assertSuper();
  if (!["off", "dry_run", "live"].includes(mode)) return { ok: false, error: "Mode must be off, dry_run or live." };
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Service role not configured." };
  const { data, error } = await sb.from("platform_switches").update({ checkout_followup_mode: mode, updated_at: new Date().toISOString() }).eq("id", true).select("checkout_followup_mode");
  if (error) return { ok: false, error: /checkout_followup_mode/.test(error.message) ? "Run supabase/migrations/2026_zzzx_checkout_followup.sql first." : error.message };
  if (!data?.length) return { ok: false, error: "The platform_switches row is missing — run 2026_collections_safety.sql." };
  return { ok: true, mode };
}

/** Sends the real template, with synthetic data, to the signed-in operator only. */
export async function sendCheckoutFollowupTest(): Promise<{ ok: boolean; to?: string; error?: string }> {
  await assertSuper();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const to = String(user?.email || "");
  const { sendFollowupTest } = await import("@/lib/checkout-followup");
  const r = await sendFollowupTest(to);
  return r.ok ? { ok: true, to } : { ok: false, error: r.error };
}

export async function provisionBusinesses() {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) throw new Error("Sign in first.");

  const created: string[] = [];
  for (const b of MY_BUSINESSES) {
    const { data: existing } = await sb.from("organizations").select("id").ilike("name", b.name).limit(1).maybeSingle();
    let orgId = (existing as any)?.id as string | undefined;
    if (!orgId) {
      const { data: row, error } = await sb.from("organizations")
        .insert({ name: b.name, industry: b.industry, currency: "INR", plan: "premium", accent: "gold" })
        .select("id").single();
      if (error) throw new Error(`Could not create ${b.name}: ${error.message}`);
      orgId = (row as any).id;
      created.push(b.name);
      // Mark my own businesses as paid so they're never trial-gated (no-op if column absent).
      try { await sb.from("organizations").update({ subscription_status: "active" }).eq("id", orgId); } catch { /* column may not exist yet */ }
    }
    /* Checked: an unchecked insert reported "provisioned" while the operator
       had no membership and could not open the workspace. */
    const { data: mem, error: memReadErr } = await sb.from("memberships").select("id").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (memReadErr) throw new Error(`Could not check your membership of ${b.name}: ${memReadErr.message}`);
    if (!mem) {
      const { data: ins, error: memErr } = await sb.from("memberships").insert({ org_id: orgId, user_id: user.id, role: "owner" }).select("id");
      if (memErr && memErr.code !== "23505") throw new Error(`Could not add you to ${b.name}: ${memErr.message}`);
      if (!memErr && !(ins as any[])?.length) throw new Error(`Could not add you to ${b.name}: no membership row was written.`);
    }
  }
  return { ok: true, created };
}

/** Super-admin grants a person access to any organization (works pre-signup via invites). */
export async function grantOrgAccess(org_id: string, email: string, role: string) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (!org_id || !email) throw new Error("Organization and email are required.");
  const { error } = await sb.from("invites").insert({ org_id, email: email.toLowerCase(), role, status: "pending" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Derived from the catalogue, not typed out again. The hand-written copy still
// listed the old six-tier ladder after pricing changed, so `aicoo` was rejected
// as "Unknown plan" — the ₹39,999 tier literally could not be assigned to
// anyone. Legacy ids stay accepted so existing rows remain editable.
const LEGACY_PLANS = ["solo", "premium"];
const VALID_PLANS = [...PLANS.map((p) => p.id), ...LEGACY_PLANS];
const VALID_STATUS = ["trialing", "active", "expired", "suspended", "cancelled"];

/**
 * Super-admin management of any customer workspace: change plan, subscription
 * status, credit balance, and trial length. All changes bypass RLS via the
 * service role and are gated by assertSuper(). Credits are handled separately
 * so the tool still works before the `credits` column migration is applied.
 */
export async function manageOrg(org_id: string, patch: {
  plan?: string;
  subscription_status?: string;
  creditsDelta?: number;
  creditsSet?: number;
  creditsAllowance?: number;
  extendTrialDays?: number;
  /** Give this workspace a paid period of N days from now (or from its current end). */
  subscriptionDays?: number;
}) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (!org_id) throw new Error("Organization is required.");

  /*
    READ THE BEFORE STATE. THE AUDIT TABLE HAS EXISTED THE WHOLE TIME.

    2026_credits.sql creates org_billing_log(org_id, actor, action, detail,
    created_at) with the comment "keep a light audit trail of super-admin
    billing changes", and 2026_hardening.sql put RLS on it. Nothing has ever
    written a row. Grep finds the CREATE, the policy, and its inclusion in the
    backup and erasure table lists — no INSERT anywhere in the application.

    So every plan change, every status change, every allowance override
    (including `-1`, which hands a workspace uncapped AI at roughly ₹77 a video
    clip) happened with no record of who did it, when, or what it was before.
    The credit ledger did record the amount — with user_id left NULL, so it
    says credits vanished and not who took them.

    That is survivable with one operator and no customers. It stops being
    survivable the first time a customer disputes a balance, or the first time
    the answer to "why is this workspace on Command?" has to come from memory.

    Before-and-after, in one row, because a log that records only the new value
    cannot tell you what you undid.
  */
  let before: Record<string, any> = {};
  try {
    const { data } = await sb.from("organizations")
      .select("plan, subscription_status, subscription_ends_at, trial_ends_at, credits, credits_allowance")
      .eq("id", org_id).maybeSingle();
    before = (data as any) || {};
  } catch { /* pre-migration database — the log below degrades with it */ }

  const updates: Record<string, any> = {};
  if (patch.plan) {
    if (!VALID_PLANS.includes(patch.plan)) throw new Error(`Unknown plan: ${patch.plan}`);
    updates.plan = patch.plan;
  }
  if (patch.subscription_status) {
    if (!VALID_STATUS.includes(patch.subscription_status)) throw new Error(`Unknown status: ${patch.subscription_status}`);
    updates.subscription_status = patch.subscription_status;
    // Switching a workspace back to "active" by hand must not leave a stale past
    // end date behind, or the nightly sweep would expire it again immediately.
    // No explicit period = a perpetual manual grant (null end date).
    if (patch.subscription_status === "active" && typeof patch.subscriptionDays !== "number") {
      updates.subscription_ends_at = null;
    }
  }
  if (typeof patch.subscriptionDays === "number" && patch.subscriptionDays > 0) {
    const { data } = await sb.from("organizations").select("subscription_ends_at").eq("id", org_id).maybeSingle();
    const cur = (data as any)?.subscription_ends_at ? new Date((data as any).subscription_ends_at).getTime() : 0;
    const base = Math.max(cur, Date.now()); // extend from now if already lapsed
    updates.subscription_ends_at = new Date(base + patch.subscriptionDays * 86_400_000).toISOString();
    updates.subscription_status = "active";
  }
  if (typeof patch.extendTrialDays === "number" && patch.extendTrialDays !== 0) {
    const { data } = await sb.from("organizations").select("trial_ends_at").eq("id", org_id).maybeSingle();
    const cur = (data as any)?.trial_ends_at ? new Date((data as any).trial_ends_at).getTime() : Date.now();
    const base = Math.max(cur, Date.now()); // extend from now if already expired
    updates.trial_ends_at = new Date(base + patch.extendTrialDays * 86_400_000).toISOString();
  }

  if (typeof patch.creditsAllowance === "number") updates.credits_allowance = patch.creditsAllowance;

  // Credits — column may not exist yet; degrade gracefully.
  let newCredits: number | undefined;
  let prevCredits = 0;
  let creditsWarning: string | undefined;
  if (typeof patch.creditsSet === "number" || typeof patch.creditsDelta === "number") {
    try {
      const { data, error } = await sb.from("organizations").select("credits").eq("id", org_id).single();
      if (error) throw error;
      prevCredits = Number((data as any)?.credits ?? 0);
      newCredits = typeof patch.creditsSet === "number" ? patch.creditsSet : prevCredits + (patch.creditsDelta || 0);
      if (newCredits < 0) newCredits = 0;
      updates.credits = newCredits;
    } catch {
      creditsWarning = "The `credits` column doesn't exist yet — run the migration to manage credits.";
      newCredits = undefined;
    }
  }

  let periodWarning: string | undefined;
  if (Object.keys(updates).length) {
    /* .select("id") makes a zero-row update visible: an org id that matches
       nothing used to "save" successfully and report the change as made. */
    const { data: upd, error } = await sb.from("organizations").update(updates).eq("id", org_id).select("id");
    if (error) {
      // The subscription-period columns may not exist yet. Retry without them so
      // changing a plan or status still works before 2026_hardening.sql is run.
      const { subscription_ends_at, subscription_cycle, ...rest } = updates;
      if (("subscription_ends_at" in updates) && Object.keys(rest).length) {
        const retry = await sb.from("organizations").update(rest).eq("id", org_id).select("id");
        if (retry.error) throw new Error(retry.error.message);
        if (!(retry.data as any[])?.length) throw new Error("No workspace matched that id — nothing was changed.");
        periodWarning = "Saved, but the subscription period columns don't exist yet — run supabase/migrations/2026_hardening.sql to enable plan expiry.";
      } else {
        throw new Error(error.message);
      }
    } else if (!(upd as any[])?.length) {
      throw new Error("No workspace matched that id — nothing was changed.");
    }
  }

  // Who is doing this. Resolved from the verified session, not passed in.
  let actor = "unknown";
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    actor = user?.email || user?.id || "unknown";
  } catch { /* assertSuper already passed; a missing email is not worth failing on */ }

  // Record the credit change in the ledger (best-effort; table may not exist yet).
  if (typeof newCredits === "number" && newCredits !== prevCredits) {
    const reason = typeof patch.creditsSet === "number" ? "admin:set" : (newCredits >= prevCredits ? "admin:add" : "admin:revoke");
    try {
      /*
        `user_id` was omitted, though the column has been there since
        2026_credit_metering.sql. The ledger recorded that credits moved and not
        who moved them — which is exactly the question asked when a customer
        says their balance is wrong.
      */
      const { data: { user } } = await (await createClient()).auth.getUser();
      const { error: ledErr } = await sb.from("credit_ledger").insert({
        org_id, delta: newCredits - prevCredits, balance_after: newCredits, reason,
        user_id: user?.id ?? null,
        meta: { actor },
      });
      /*
        Checked, not caught. supabase-js RETURNS { error } rather than throwing,
        so the fallback below was dead code — on a database without user_id the
        ledger row was simply lost, quietly, which is the opposite of the point.
      */
      if (ledErr) {
        const retry = await sb.from("credit_ledger").insert({ org_id, delta: newCredits - prevCredits, balance_after: newCredits, reason, meta: {} });
        if (retry.error) console.error("[superadmin] credit_ledger insert failed:", retry.error.message);
      }
    } catch (e: any) {
      console.error("[superadmin] credit_ledger insert threw:", e?.message);
    }
  }

  /*
    The audit row. Best-effort in the sense that it must never stop a change
    the operator needs to make in an incident — but loud in the logs if it
    fails, because a silent audit trail is indistinguishable from none.
  */
  if (Object.keys(updates).length) {
    const after: Record<string, any> = {};
    for (const k of Object.keys(updates)) after[k] = updates[k];
    const changed: Record<string, any> = {};
    for (const k of Object.keys(updates)) {
      if ((before as any)[k] !== updates[k]) changed[k] = { from: (before as any)[k] ?? null, to: updates[k] };
    }
    /*
      CHECK `error`, DO NOT RELY ON A THROW.

      supabase-js RETURNS { error } — it does not throw on a database error. So
      the try/catch this replaces was unreachable for exactly the failures it
      claimed to report ("loud in the logs if it fails"), and a missing table or
      a constraint violation was swallowed as silently as before. A silent audit
      trail is indistinguishable from no audit trail, which is the thing this
      whole block exists to fix.
    */
    try {
      const { error: logErr } = await sb.from("org_billing_log").insert({
        org_id,
        actor,
        action: Object.keys(changed).join(",") || "no-op",
        detail: { changed, requested: patch },
      });
      if (logErr) console.error("[superadmin] org_billing_log insert failed:", logErr.message);
    } catch (e: any) {
      console.error("[superadmin] org_billing_log insert threw:", e?.message);
    }
  }

  return { ok: true, credits: newCredits, creditsWarning, periodWarning };
}

/**
 * Recompute one workspace's KPIs, now.
 *
 * recomputeMetrics() has always taken an org id and has always been callable
 * with any of them — but every in-app caller is recomputeQuietly() behind a
 * membership check, so the only thing that ever recomputed a CUSTOMER's numbers
 * was the 04:30 cron. "My dashboard looks stale" therefore had one answer:
 * wait until tomorrow. This is the same function the cron calls, on demand.
 */
export async function recomputeOrg(org_id: string) {
  await assertSuper();
  if (!org_id) throw new Error("Organization is required.");
  const { recomputeMetrics } = await import("@/lib/metrics");
  const res = await recomputeMetrics(org_id);
  return { ok: true, result: res };
}

/** Make the super-admin an owner of any workspace so they can view it. */
export async function joinOrg(org_id: string) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user || !org_id) throw new Error("Missing user or organization.");
  /* Checked: this reported "joined" when the insert was rejected (PostgREST
     returns { error }, it does not throw) or wrote nothing. */
  const { data: mem, error: memReadErr } = await sb.from("memberships").select("id").eq("org_id", org_id).eq("user_id", user.id).maybeSingle();
  if (memReadErr) throw new Error(`Could not check your membership: ${memReadErr.message}`);
  if (!mem) {
    const { data: ins, error: memErr } = await sb.from("memberships").insert({ org_id, user_id: user.id, role: "owner" }).select("id");
    if (memErr && memErr.code !== "23505") throw new Error(`Could not join the workspace: ${memErr.message}`);
    if (!memErr && !(ins as any[])?.length) throw new Error("Could not join the workspace: no membership row was written.");
  }
  return { ok: true };
}

/**
 * One-click customer onboarding: creates a workspace, sets its plan + status +
 * starting credits, adds a pre-signup owner invite so the person owns it the
 * moment they sign up, and emails them an activation link. No auth user is
 * created directly — the customer signs themselves up, which is the safe path.
 */
export async function provisionCustomer(input: {
  email: string; name?: string; company?: string; plan?: string; credits?: number; industry?: string;
}) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  const email = (input.email || "").toLowerCase().trim();
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");
  const plan = VALID_PLANS.includes(input.plan || "") ? (input.plan as string) : "growth";
  const orgName = (input.company || "").trim()
    || ((input.name || "").trim() ? `${(input.name as string).trim()} — Workspace` : `${email.split("@")[0]} — Workspace`);

  // 1) Create the workspace (same insert shape proven in provisionBusinesses).
  const { data: org, error: orgErr } = await sb.from("organizations")
    .insert({ name: orgName, industry: input.industry || "general", currency: "INR", plan, accent: "gold" })
    .select("id").single();
  if (orgErr) throw new Error(`Could not create workspace: ${orgErr.message}`);
  const orgId = (org as any).id as string;

  // 2) Plan + active status + starting credits, via the ledger-aware manageOrg.
  const credits = typeof input.credits === "number" && input.credits > 0 ? Math.round(input.credits) : 0;
  let creditsWarning: string | undefined;
  try {
    const res = await manageOrg(orgId, { plan, subscription_status: "active", ...(credits ? { creditsSet: credits } : {}) });
    creditsWarning = (res as any)?.creditsWarning;
  } catch (e: any) {
    // Non-fatal: the workspace exists; surface the reason so the operator can retry credits.
    creditsWarning = e?.message || "Could not set plan/credits automatically.";
  }

  // 3) Pre-signup owner invite so they join automatically on sign-up.
  /*
    CHECKED, AND IT GATES THE EMAIL. This was try { insert } catch {} — and
    supabase-js returns { error } rather than throwing, so a failed insert was
    invisible and the customer was still emailed "sign in and you'll land
    straight in your workspace" for a workspace they could never reach. A
    duplicate (23505: an invite already pending) is fine; anything else stops
    here, before the email.
  */
  {
    const { error: invErr } = await sb.from("invites").insert({ org_id: orgId, email, role: "owner", status: "pending" });
    if (invErr && invErr.code !== "23505") {
      throw new Error(`Workspace "${orgName}" was created, but the owner invite for ${email} could not be saved (${invErr.message}), so no activation email was sent. Use "Grant access" to invite them.`);
    }
  }

  // 4) Email the customer their activation link.
  const appUrl = (process.env.APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
  const first = (input.name || "").trim().split(" ")[0] || "there";
  const body = `Hi ${first},

Great news — your MNB Cortex workspace is ready.

Plan: ${plan.charAt(0).toUpperCase() + plan.slice(1)}${credits ? `
Starting AI credits: ${credits.toLocaleString("en-IN")}` : ""}

To activate it, sign in using THIS email address (${email}):
${appUrl}/login

You'll land straight in your workspace — it's already set up and ready.

Welcome aboard,
Team MNB Cortex · MNB Research`;
  let emailed = false;
  try {
    const res = await sendEmail(email, "Your MNB Cortex workspace is ready", renderBrandedEmail(body, { preheader: "Activate your MNB Cortex workspace" }), { from: brandFrom(), replyTo: brandReplyTo() });
    emailed = res.sent;
  } catch { /* email is best-effort */ }

  return { ok: true, org_id: orgId, orgName, plan, credits, emailed, creditsWarning };
}

/**
 * Super Admin: Provision a 7-day customized demo workspace.
 *
 * Configures exact feature access, 7-day strictly enforced trial duration,
 * starting AI credits, optional pre-seeded sample data, and branded onboarding email.
 */
export async function provisionDemoCustomer(input: {
  email: string;
  name?: string;
  company?: string;
  industry?: string;
  preset?: DemoPresetId;
  features?: string[];
  credits?: number;
  durationDays?: number;
  preSeedData?: boolean;
}) {
  await assertSuper();
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  const email = (input.email || "").toLowerCase().trim();
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");

  const presetId = input.preset || "enterprise_full";
  const foundPreset = DEMO_PRESETS.find((p) => p.id === presetId);
  const features = Array.isArray(input.features) && input.features.length > 0
    ? input.features
    : (foundPreset ? foundPreset.featureIds : []);

  const durationDays = typeof input.durationDays === "number" && input.durationDays > 0 ? input.durationDays : DEMO_TRIAL_DURATION_DAYS;
  const credits = typeof input.credits === "number" && input.credits >= 0 ? Math.round(input.credits) : DEMO_DEFAULT_STARTING_CREDITS;

  const { expiresAt } = calculateDemoExpiry(new Date(), durationDays);

  const orgName = (input.company || "").trim()
    || ((input.name || "").trim() ? `${(input.name as string).trim()} (Demo)` : `${email.split("@")[0]} (Demo)`);

  // 1) Create the workspace with trial_ends_at = expiresAt
  const { data: org, error: orgErr } = await sb.from("organizations")
    .insert({
      name: orgName,
      industry: input.industry || "general",
      currency: "INR",
      plan: "enterprise",
      accent: "gold",
    })
    .select("id").single();
  if (orgErr) throw new Error(`Could not create demo workspace: ${orgErr.message}`);
  const orgId = (org as any).id as string;

  // 2) Set subscription_status: "trialing", trial_ends_at: expiresAt, and starting credits via manageOrg
  let creditsWarning: string | undefined;
  try {
    const res = await manageOrg(orgId, {
      plan: "enterprise",
      subscription_status: "trialing",
      extendTrialDays: durationDays,
      creditsSet: credits,
    });
    creditsWarning = (res as any)?.creditsWarning;
  } catch (e: any) {
    creditsWarning = e?.message || "Could not set plan/credits automatically.";
  }

  // 3) Store demo workspace metadata in demo_workspaces table
  try {
    await sb.from("demo_workspaces").insert({
      org_id: orgId,
      email,
      name: input.name || null,
      company: input.company || null,
      preset: presetId,
      features,
      duration_days: durationDays,
      expires_at: expiresAt,
      compulsory_upgrade: true,
    });
  } catch (e: any) {
    console.error("[superadmin] demo_workspaces insert error:", e?.message);
  }

  // 4) Pre-signup owner invite so they own the demo workspace immediately upon login
  const { error: invErr } = await sb.from("invites").insert({ org_id: orgId, email, role: "owner", status: "pending" });
  if (invErr && invErr.code !== "23505") {
    throw new Error(`Demo workspace "${orgName}" created, but invite for ${email} could not be saved (${invErr.message}).`);
  }

  // 5) If preSeedData enabled (default true), populate realistic demo figures
  if (input.preSeedData !== false) {
    try {
      await seedDemoWorkspace(orgId);
    } catch (e: any) {
      console.error("[superadmin] demo seed failed:", e?.message);
    }
  }

  // 6) Send branded demo welcome email
  const appUrl = (process.env.APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
  const first = (input.name || "").trim().split(" ")[0] || "there";
  const expiryFormatted = new Date(expiresAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  const emailBody = generateDemoWelcomeEmail({
    recipientName: first,
    email,
    companyName: orgName,
    presetName: foundPreset ? foundPreset.name : "Custom 7-Day Demo",
    features,
    expiresAtDateStr: expiryFormatted,
    credits,
    appUrl,
  });

  let emailed = false;
  try {
    const res = await sendEmail(
      email,
      `Your 7-Day MNB Cortex Demo is Ready (${orgName})`,
      renderBrandedEmail(emailBody, { preheader: "Activate your 7-day MNB Cortex demo workspace" }),
      { from: brandFrom(), replyTo: brandReplyTo() }
    );
    emailed = res.sent;
  } catch { /* best effort */ }

  return {
    ok: true,
    org_id: orgId,
    orgName,
    preset: presetId,
    featuresCount: features.length,
    expiresAt,
    credits,
    emailed,
    creditsWarning,
  };
}
