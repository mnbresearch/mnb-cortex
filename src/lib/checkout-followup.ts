import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { renderBrandedEmail, brandFrom, brandReplyTo } from "@/lib/branded-email";
import { PLANS, CREDIT_PACKS } from "@/lib/config";
import { unsubUrl } from "@/lib/weekly-update";
import { planFollowups, renderFollowup, maskEmail, MAX_AGE_DAYS, COOLDOWN_DAYS, type FollowupMode, type IntentRow, type Decision } from "@/lib/checkout-followup-plan";
import type { Budget } from "@/lib/cron-budget";

/*
  ABANDONED-CHECKOUT FOLLOW-UP — the runner. Rules and copy are in
  checkout-followup-plan.ts (pure, tested); this file loads inputs, claims
  each send, sends, and records what happened.

  MODES (platform_switches.checkout_followup_mode, set from the operator
  console; env CHECKOUT_FOLLOWUP_MODE=off is a hard kill that overrides it):

    off      nothing is computed or sent
    dry_run  DEFAULT. The plan is computed and reported (console + cron
             summary); nothing is sent and nothing is written to
             checkout_followups, so switching to live later loses nothing.
    live     sends, one claimed row per order.

  Before 2026_zzzx is applied the mode column does not exist and the mode
  reads as "off" — the feature cannot send on a database that cannot record it.

  CHANNELS. Email only. WhatsApp would need an approved Meta template and the
  person's opt-in to WhatsApp marketing messages; neither exists for this
  message, so it is not sent there and nothing claims otherwise.
*/

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
const DAY = 86_400_000;

export type FollowupReport = {
  mode: FollowupMode;
  considered: number;
  queued: number;
  sent: number;
  failed: number;
  uncertain: number;
  skipped: Record<string, number>;
  preview: Array<{ order_id: string; to: string; item: string; amount: number | null; action: string }>;
  error?: string;
};

const missing = (e: any) => /column .* does not exist|42703|relation .* does not exist|42P01|schema cache/i.test(`${e?.message || ""} ${e?.code || ""}`);

export async function getFollowupMode(): Promise<FollowupMode> {
  if (String(process.env.CHECKOUT_FOLLOWUP_MODE || "").toLowerCase() === "off") return "off";
  const svc = serviceClient();
  if (!svc) return "off";
  try {
    const { data, error } = await svc.from("platform_switches").select("checkout_followup_mode").limit(1).maybeSingle();
    if (error) return "off";
    const m = String((data as any)?.checkout_followup_mode || "");
    return m === "live" || m === "dry_run" ? m : "off";
  } catch { return "off"; }
}

function itemFor(it: IntentRow): { name: string; cycle: string | null } {
  if (it.kind === "plan") {
    const p = PLANS.find((x) => x.id === it.ref);
    return { name: p ? `Cortex ${p.name}` : "your Cortex plan", cycle: null };
  }
  const pack = CREDIT_PACKS.find((x) => x.id === it.ref);
  return { name: pack ? `the ${pack.label} credit pack` : "a Cortex credit pack", cycle: null };
}

/** Load everything planFollowups needs, without recipients. */
async function loadInputs(svc: any, now: number) {
  const since = new Date(now - (MAX_AGE_DAYS + 1) * DAY).toISOString();
  const { data: intents, error } = await svc.from("payment_intents")
    .select("order_id, org_id, kind, ref, amount, cycle, created_at, settled_at, outcome")
    .gte("created_at", since).eq("outcome", "abandoned").limit(500);
  if (error) throw new Error(`payment_intents: ${error.message}`);
  const rows = ((intents as any[]) || []) as (IntentRow & { cycle?: string | null })[];
  const orgIds = [...new Set(rows.map((r) => r.org_id).filter(Boolean))] as string[];
  const orderIds = rows.map((r) => r.order_id);

  const [pays, orgs, prev, sentRecent] = await Promise.all([
    orgIds.length ? svc.from("cortex_payments").select("order_id, org_id, created_at, status").in("org_id", orgIds).gte("created_at", since).limit(2000) : { data: [] },
    orgIds.length ? svc.from("organizations").select("id, subscription_status, subscription_ends_at").in("id", orgIds) : { data: [] },
    orderIds.length ? svc.from("checkout_followups").select("order_id, status, attempts").in("order_id", orderIds) : { data: [] },
    orgIds.length ? svc.from("checkout_followups").select("org_id, updated_at").in("org_id", orgIds).eq("status", "sent").gte("updated_at", new Date(now - COOLDOWN_DAYS * DAY).toISOString()) : { data: [] },
  ]);
  if ((prev as any).error) throw new Error(`checkout_followups: ${(prev as any).error.message}`);

  const paidOrders = new Set<string>(); const lastPaidAt = new Map<string, number>();
  for (const p of ((pays as any).data || [])) {
    paidOrders.add(String(p.order_id));
    if (String(p.status || "paid") === "paid" || String(p.status || "").startsWith("grant")) {
      const t = Date.parse(p.created_at); if (p.org_id && t > (lastPaidAt.get(p.org_id) ?? 0)) lastPaidAt.set(p.org_id, t);
    }
  }
  const activeOrgs = new Set<string>();
  for (const o of ((orgs as any).data || [])) {
    const ends = o.subscription_ends_at ? Date.parse(o.subscription_ends_at) : 0;
    if (String(o.subscription_status || "") === "active" && (!ends || ends > now)) activeOrgs.add(o.id);
  }
  const previous = new Map<string, { status: string; attempts: number }>();
  for (const r of ((prev as any).data || [])) previous.set(r.order_id, { status: String(r.status), attempts: Number(r.attempts) || 0 });
  const lastSentAt = new Map<string, number>();
  for (const r of ((sentRecent as any).data || [])) { const t = Date.parse(r.updated_at); if (t > (lastSentAt.get(r.org_id) ?? 0)) lastSentAt.set(r.org_id, t); }
  return { rows, paidOrders, lastPaidAt, activeOrgs, previous, lastSentAt };
}

async function ownerOf(svc: any, orgId: string): Promise<{ email: string; confirmed: boolean } | null> {
  try {
    const { data: mem } = await svc.from("memberships").select("user_id").eq("org_id", orgId).eq("role", "owner").limit(1);
    const uid = (mem as any[])?.[0]?.user_id;
    if (!uid) return null;
    const { data: u } = await svc.auth.admin.getUserById(uid);
    const email = String(u?.user?.email || "").trim();
    return email ? { email, confirmed: Boolean(u?.user?.email_confirmed_at) } : null;
  } catch { return null; }
}

/**
 * Compute (and in live mode, send) the follow-ups. `forceMode` lets the
 * console preview a dry run whatever the stored mode is; it can never force
 * "live" past the env kill switch.
 */
export async function runCheckoutFollowups(opts: { budget?: Budget; forceMode?: "dry_run" } = {}): Promise<FollowupReport> {
  const stored = await getFollowupMode();
  /* A console preview is always a dry run; it never sends, whatever is stored. */
  const mode: FollowupMode = opts.forceMode === "dry_run" ? "dry_run" : stored;
  const rep: FollowupReport = { mode, considered: 0, queued: 0, sent: 0, failed: 0, uncertain: 0, skipped: {}, preview: [] };
  if (mode === "off") return rep;
  const svc = serviceClient();
  if (!svc) return { ...rep, error: "service role not configured" };
  const now = Date.now();

  let inp;
  try { inp = await loadInputs(svc, now); }
  catch (e: any) { return { ...rep, error: missing(e) ? "run supabase/migrations/2026_zzzx_checkout_followup.sql" : String(e?.message || e) }; }
  rep.considered = inp.rows.length;

  /* Pass 1 without recipients → candidates; resolve only their owners; pass 2 decides. */
  const first = planFollowups({ now, intents: inp.rows, paidOrders: inp.paidOrders, lastPaidAt: inp.lastPaidAt, activeOrgs: inp.activeOrgs, previous: inp.previous, lastSentAt: inp.lastSentAt });
  const candidateOrgs = [...new Set(first.filter((d) => d.action !== "skip").map((d) => d.org_id as string))];
  const recipients = new Map<string, { email: string; confirmed: boolean }>();
  for (const o of candidateOrgs) {
    if (opts.budget && !opts.budget.ok(1_500)) break;
    const r = await ownerOf(svc, o); if (r) recipients.set(o, r);
  }
  const optedOut = new Set<string>();
  if (recipients.size) {
    try {
      const { data } = await svc.from("email_optouts").select("email").in("email", [...recipients.values()].map((r) => r.email.toLowerCase()));
      for (const r of ((data as any[]) || [])) optedOut.add(String(r.email).toLowerCase());
    } catch { /* absent table: the list is empty, which is the truth */ }
  }
  const decisions: Decision[] = planFollowups({ now, intents: inp.rows, paidOrders: inp.paidOrders, lastPaidAt: inp.lastPaidAt, activeOrgs: inp.activeOrgs, previous: inp.previous, lastSentAt: inp.lastSentAt, recipients, optedOut });

  for (const d of decisions) {
    if (d.action === "skip") { rep.skipped[d.reason] = (rep.skipped[d.reason] || 0) + 1; continue; }
    rep.queued++;
    const item = itemFor(d.intent);
    rep.preview.push({ order_id: d.order_id, to: maskEmail(d.to || ""), item: item.name, amount: d.intent.amount ?? null, action: d.action });
    if (mode !== "live") continue;
    if (opts.budget && !opts.budget.ok(3_000)) break;

    /* CLAIM. A new order: insert-or-nothing. A retry: only a still-failed row under the attempt cap. Zero rows back = someone else has it. */
    let claimed = false;
    if (d.action === "send") {
      const { data, error } = await svc.from("checkout_followups")
        .upsert({ order_id: d.order_id, org_id: d.org_id, kind: d.intent.kind, ref: d.intent.ref, status: "sending", attempts: 1, updated_at: new Date().toISOString() }, { onConflict: "order_id", ignoreDuplicates: true })
        .select("order_id");
      claimed = !error && Array.isArray(data) && data.length === 1;
    } else {
      const prevAttempts = inp.previous.get(d.order_id)?.attempts ?? 0;
      const { data, error } = await svc.from("checkout_followups")
        .update({ status: "sending", attempts: prevAttempts + 1, updated_at: new Date().toISOString() })
        .eq("order_id", d.order_id).eq("status", "failed").eq("attempts", prevAttempts).select("order_id");
      claimed = !error && Array.isArray(data) && data.length === 1;
    }
    if (!claimed) { rep.skipped["claimed by another run"] = (rep.skipped["claimed by another run"] || 0) + 1; rep.queued--; continue; }

    const to = d.to as string;
    const unsubscribe = unsubUrl(to);
    const content = renderFollowup({
      firstName: to.split("@")[0].replace(/[._-]+/g, " ").split(" ")[0] || "there",
      itemName: item.name, amount: d.intent.amount ?? null, cycle: (d.intent as any).cycle ?? null,
      startedOn: new Date(d.intent.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" }),
      billingUrl: `${APP_URL}/billing`, unsubscribeUrl: unsubscribe,
    });
    const html = renderBrandedEmail(content.body, { origin: APP_URL, preheader: content.subject });
    const res = await sendEmail(to, content.subject, html, {
      from: brandFrom(), replyTo: brandReplyTo(), kind: "checkout_followup", orgId: d.org_id,
      headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    /* sent → done; rejected → failed (retried later, capped); unknown → never retried (could be a duplicate). */
    const status = res.sent ? "sent" : res.state === "unknown" ? "unknown" : "failed";
    await svc.from("checkout_followups").update({
      status, sent_to: maskEmail(to), correlation_id: res.correlationId || null,
      reason: res.sent ? null : String((res as any).reason || "").slice(0, 200), updated_at: new Date().toISOString(),
    }).eq("order_id", d.order_id);
    if (res.sent) {
      rep.sent++;
      const { recordQuietly } = await import("@/lib/funnel");
      recordQuietly("checkout_followup_sent", { orgId: d.org_id, meta: { kind: String(d.intent.kind || "") } });
    } else if (status === "unknown") rep.uncertain++;
    else rep.failed++;
  }
  return rep;
}

/**
 * The operator's "send me a test" button: renders the real template with
 * SYNTHETIC data and sends it only to the operator's own address. Nothing is
 * written to checkout_followups.
 */
export async function sendFollowupTest(to: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: "No valid test address." };
  const p = PLANS.find((x) => x.id === "watchpro") || PLANS[0];
  const content = renderFollowup({
    firstName: "there", itemName: `Cortex ${p.name}`, amount: p.monthly, cycle: "monthly",
    startedOn: new Date(Date.now() - 4 * DAY).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" }),
    billingUrl: `${APP_URL}/billing`, unsubscribeUrl: unsubUrl(to),
  });
  const html = renderBrandedEmail(content.body, { origin: APP_URL, preheader: content.subject });
  const res = await sendEmail(to, `[TEST] ${content.subject}`, html, { from: brandFrom(), replyTo: brandReplyTo(), kind: "checkout_followup_test" });
  return res.sent ? { ok: true } : { ok: false, error: String((res as any).reason || "The provider did not accept it.") };
}
