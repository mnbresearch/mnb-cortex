import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { brandFrom, renderBrandedEmail } from "@/lib/branded-email";
import { ownerContact } from "@/lib/alert-delivery";
import { CATALOGUE_BY_KEY } from "@/lib/engine/catalogue";
import { isHighImpact } from "@/lib/engine/policy";
import { signDecision, decisionUrl } from "@/lib/engine/decision-links";
import type { Budget } from "@/lib/cron-budget";

/*
  "NEEDS YOUR DECISION" — the daily email that closes the autonomy loop.

  Cortex proposes; the owner decides; nothing happens in between unless the
  owner has granted that action auto. Until now the deciding half depended on
  someone opening /approvals. This sends one email per workspace per day
  listing every proposal still waiting, each with a link that opens the
  decision page for exactly that proposal.

  The pattern is alert-delivery's, because it earned its scars there:
    · claim (notified_at) BEFORE sending, so a retried cron cannot send twice
    · release the claim on every exit that did not deliver
    · one email per workspace per 20 hours
    · a per-run budget so one slow mailbox cannot eat the cron
  A proposal that is decided in the app before the digest goes out simply
  drops out of the query — the status filter is evaluated at send time.
*/

const MAX_ORGS = 50;
const MAX_ITEMS = 10;
const MIN_GAP_MS = 20 * 60 * 60 * 1000;

export type DigestResult = { orgs: number; sent: number; proposals: number; skipped: string[] };

export async function sendDecisionDigests(origin: string, budget?: Budget): Promise<DigestResult> {
  const svc = serviceClient();
  const out: DigestResult = { orgs: 0, sent: 0, proposals: 0, skipped: [] };
  if (!svc) { out.skipped.push("no service role"); return out; }

  let rows: any[] = [];
  try {
    const { data, error } = await svc.from("action_proposals")
      .select("id, org_id, action, args, rationale, evidence, source, policy_reason, expires_at, created_at")
      .eq("status", "proposed")
      .is("notified_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    rows = (data as any[]) || [];
  } catch (e: any) {
    // notified_at not migrated yet → doing nothing is the correct behaviour
    // (see alert-delivery): without a claim column every run would resend.
    out.skipped.push(`query failed: ${e?.message || "unknown"} (is 2026_zzzs applied?)`);
    return out;
  }
  if (!rows.length) return out;

  const byOrg = new Map<string, any[]>();
  for (const r of rows) { if (!byOrg.has(r.org_id)) byOrg.set(r.org_id, []); byOrg.get(r.org_id)!.push(r); }
  out.orgs = byOrg.size;

  for (const [orgId, list] of Array.from(byOrg).slice(0, MAX_ORGS)) {
    if (budget && !budget.ok(2_500)) { out.skipped.push("budget"); break; }

    const ids = list.map((p) => p.id);
    const stamp = new Date().toISOString();
    let claimed: string[] = [];
    try {
      const { data: upd } = await svc.from("action_proposals")
        .update({ notified_at: stamp })
        .eq("org_id", orgId).in("id", ids).is("notified_at", null).eq("status", "proposed").select("id");
      claimed = ((upd as any[]) || []).map((u) => u.id);
    } catch { claimed = []; }
    if (!claimed.length) continue;
    const release = async () => {
      try { await svc.from("action_proposals").update({ notified_at: null }).eq("org_id", orgId).in("id", claimed); } catch { /* ages out */ }
    };

    // One digest per workspace per 20h, measured against the org's own last send.
    try {
      const { data: recent } = await svc.from("action_proposals")
        .select("notified_at").eq("org_id", orgId).not("notified_at", "is", null)
        .not("id", "in", `(${claimed.join(",")})`)
        .order("notified_at", { ascending: false }).limit(1);
      const last = (recent as any[])?.[0]?.notified_at;
      if (last && Date.now() - new Date(last).getTime() < MIN_GAP_MS) { await release(); continue; }
    } catch { /* no history — proceed */ }

    const to = await ownerContact(svc, orgId);
    if (!to) { await release(); out.skipped.push(`${orgId}: no owner email`); continue; }

    const items = list.filter((p) => claimed.includes(p.id)).slice(0, MAX_ITEMS);
    const lines: string[] = [];
    let linked = 0;
    for (const p of items) {
      const def = CATALOGUE_BY_KEY[p.action];
      const what = (() => { try { return def ? def.describe(p.args || {}) : p.action; } catch { return def?.title || p.action; } })();
      const why = p.rationale ? `\nWhy: ${String(p.rationale).slice(0, 240)}` : "";
      const ev = Array.isArray(p.evidence) && p.evidence.length ? `\nLooked at: ${p.evidence.slice(0, 3).map((e: unknown) => String(e).slice(0, 80)).join("; ")}` : "";
      const token = signDecision({ p: p.id, o: orgId, u: to.userId, expiresAt: p.expires_at });
      /* Money and outbound need a second factor, which an email link cannot carry: it opens the proposal and can reject; approving happens in the app. */
      const high = def ? isHighImpact(def) : true;
      const link = token ? (high ? `\nReview (approve in the app with your second factor, or reject here): ${decisionUrl(origin, token)}` : `\nDecide: ${decisionUrl(origin, token)}`) : "";
      if (token) linked++;
      lines.push(`${what}${why}${ev}\nProposed by ${p.source === "chat" ? "you, in chat" : p.source}${def?.reversible ? " · reversible" : " · cannot be undone once run"}${link}`);
    }
    const more = list.length > items.length ? `\n\n…and ${list.length - items.length} more on the Approvals page.` : "";
    const body =
      `${items.length === 1 ? "One action is" : `${items.length} actions are`} waiting for your decision. Nothing runs until you approve it.\n\n` +
      lines.join("\n\n") + more +
      `\n\nReview everything: ${origin.replace(/\/$/, "")}/approvals` +
      (linked < items.length ? `\n\n(Decision links are off on this deployment — approve from the Approvals page.)` : "") +
      `\n\nEach link opens one proposal and asks you to confirm — opening it changes nothing.`;

    try {
      const html = renderBrandedEmail(body, { origin, preheader: lines[0]?.split("\n")[0] });
      const subject = items.length === 1 ? `Cortex needs your decision: ${lines[0].split("\n")[0]}`.slice(0, 120) : `Cortex: ${items.length} actions need your decision`;
      const res = await sendEmail(to.email, subject, html, { from: brandFrom(), kind: "decision_digest", orgId });
      if (res.sent) { out.sent++; out.proposals += items.length; }
      else { await release(); out.skipped.push(`${orgId}: send failed`); }
    } catch { /* may have delivered — keep the claim rather than risk a daily repeat */ }
  }
  return out;
}
