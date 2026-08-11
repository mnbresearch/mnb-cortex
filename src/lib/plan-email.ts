import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { brandFrom } from "@/lib/branded-email";
import { buildPriorities, type Priority } from "@/lib/ai/priorities";
import { unsubToken } from "@/lib/weekly-update";

// "Your plan for the week" — a per-workspace email built from the SAME prioritizer
// as the in-app command center. Each owner gets the few actions that matter, from
// their own numbers. Gated + opt-out respected. Only orgs with real data are emailed.

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
const CONTACT = "contact@mnbresearch.com";
const C_FROM = "#1f4a3b", C_TO = "#2f6b54";
const U: Record<string, string> = { high: "Now", medium: "This week", low: "Soon" };

function esc(s: string) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function unsubUrl(email: string) { return `${APP_URL}/api/unsub?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`; }
function firstNameOf(email: string, meta?: any): string {
  const n = String(meta?.full_name || meta?.name || "").trim(); if (n) return n.split(/\s+/)[0];
  const p = String(email.split("@")[0] || "").replace(/[._\-+]+/g, " ").trim(); const w = p.split(" ")[0];
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : "there";
}
function ctxFromMetrics(m: any[]): string {
  return "KEY METRICS:\n" + m.map((x) => `- ${x.label}: ${x.value}${x.unit === "INR" ? " INR" : " " + (x.unit || "")} (${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, ${x.status})`).join("\n");
}

function renderHtml(firstName: string, plan: Priority[], unsub: string): string {
  const rows = plan.map((p, i) => `<tr><td style="padding:9px 0;border-bottom:1px solid #eef1f0;vertical-align:top">
    <div style="font-size:15px;color:#12281f"><b>${i + 1}. ${esc(p.title)}</b> <span style="font-size:11px;color:#5b6b64;border:1px solid #e6ece9;border-radius:999px;padding:1px 7px">${U[p.urgency] || "This week"}</span></div>
    <div style="font-size:13px;color:#5b6b64;margin-top:2px">${esc(p.why)}</div>
    <a href="${APP_URL}${p.href}" style="font-size:12px;color:${C_TO};text-decoration:none;font-weight:600">Open ${esc(p.tool)} →</a>
  </td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td style="background:linear-gradient(135deg,${C_FROM},${C_TO});padding:24px 28px">
    <div style="font-size:21px;font-weight:800;color:#fff">MNB Cortex</div>
    <div style="font-size:13px;color:#d9ece3;margin-top:3px">Your plan for the week</div>
  </td></tr>
  <tr><td style="padding:24px 28px 6px;color:#1a2420;font-size:15px;line-height:1.6">
    <p style="margin:0 0 6px">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 6px">Based on your numbers, here's what I'd focus on this week:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>
  <tr><td style="padding:14px 28px 22px"><a href="${APP_URL}/plan" style="display:inline-block;background:${C_TO};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:9px">Open your full plan →</a></td></tr>
  <tr><td style="padding:0 28px 8px;color:#1a2420;font-size:14px"><p style="margin:0">— Cortex, your AI COO</p></td></tr>
  <tr><td style="padding:4px 28px 26px">
    <hr style="border:none;border-top:1px solid #e6e9ef;margin:20px 0" />
    <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:0">
      <strong>MNB Cortex</strong> is a product of <strong>MNB Research</strong>, operated by <strong>Abrobot Technologies</strong>, Delhi, India.<br/>
      Email: <a href="mailto:contact@mnbresearch.com" style="color:#12315c">contact@mnbresearch.com</a> · WhatsApp/Phone: +91 97114 88481<br/>
      You're receiving this because you have an MNB Cortex workspace. <a href="${unsub}" style="color:#12315c">Unsubscribe</a> at any time.<br/>
      © 2026 Abrobot Technologies. All rights reserved.
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;
}
function renderText(firstName: string, plan: Priority[], unsub: string): string {
  const lines = plan.map((p, i) => `${i + 1}. ${p.title} [${U[p.urgency] || "This week"}]\n   ${p.why}\n   ${p.tool}: ${APP_URL}${p.href}`).join("\n\n");
  return [`Hi ${firstName},`, "", "Based on your numbers, here's what I'd focus on this week:", "", lines, "", `Open your full plan: ${APP_URL}/plan`, "", "— Cortex, your AI COO", "", "————", "MNB Cortex · MNB Research · contact@mnbresearch.com", `Unsubscribe: ${unsub}`].join("\n");
}

async function listUsers(sb: any): Promise<Map<string, { email: string; firstName: string }>> {
  const map = new Map<string, { email: string; firstName: string }>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users: any[] = data?.users || [];
    for (const u of users) {
      const email = String(u?.email || "").toLowerCase().trim();
      if (!email || (!u?.email_confirmed_at && !u?.confirmed_at)) continue;
      map.set(u.id, { email, firstName: firstNameOf(email, u?.user_metadata) });
    }
    if (users.length < 200) break;
  }
  return map;
}
async function optedOut(sb: any): Promise<Set<string>> {
  try { const { data } = await sb.from("email_optouts").select("email"); return new Set((data as any[] || []).map((r) => String(r.email || "").toLowerCase())); }
  catch { return new Set(); }
}

export type PlanSendResult = { skipped: boolean; reason?: string; orgs?: number; sent?: number; failed?: number; test?: boolean };

export async function sendWeeklyPlans(opts?: { test?: boolean }): Promise<PlanSendResult> {
  const test = !!opts?.test;
  const sb = serviceClient();
  if (!sb) return { skipped: true, reason: "no SUPABASE_SERVICE_ROLE_KEY" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: true, reason: "no RESEND_API_KEY" };

  const [users, outs] = await Promise.all([listUsers(sb), optedOut(sb)]);
  const { data: orgs } = await sb.from("organizations").select("id,name").limit(200);

  const targets: { email: string; firstName: string; plan: Priority[] }[] = [];
  let considered = 0;

  for (const o of ((orgs as any[]) || []).slice(0, 60)) {
    const { data: m } = await sb.from("health_metrics").select("label,value,unit,delta_pct,status").eq("org_id", o.id);
    if (!m?.length) continue;                       // only workspaces with real data
    const { priorities } = await buildPriorities(ctxFromMetrics(m as any[]), true);
    if (!priorities.length) continue;
    considered++;
    if (test) { targets.push({ email: CONTACT, firstName: "there", plan: priorities }); break; }
    const { data: mem } = await sb.from("memberships").select("user_id").eq("org_id", o.id);
    for (const mm of ((mem as any[]) || [])) {
      const u = users.get(mm.user_id);
      if (!u || outs.has(u.email)) continue;
      targets.push({ email: u.email, firstName: u.firstName, plan: priorities });
    }
  }

  // One email per person (a member of several orgs gets the first org's plan).
  const seen = new Set<string>();
  const final = targets.filter((t) => { if (seen.has(t.email)) return false; seen.add(t.email); return true; });
  if (!final.length) return { skipped: true, reason: "no eligible recipients", orgs: considered, test };

  const from = process.env.WEEKLY_FROM || brandFrom();
  const subject = "Your MNB Cortex plan for the week";
  let ok = 0, fail = 0;
  for (let i = 0; i < final.length; i += 100) {
    const chunk = final.slice(i, i + 100).map((t) => {
      const u = unsubUrl(t.email);
      return { from, to: [t.email], reply_to: CONTACT, subject, html: renderHtml(t.firstName, t.plan, u), text: renderText(t.firstName, t.plan, u),
        headers: { "List-Unsubscribe": `<mailto:unsubscribe@mnbresearch.com>, <${u}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
    });
    try {
      const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(chunk) });
      if (r.ok) ok += chunk.length; else fail += chunk.length;
    } catch { fail += chunk.length; }
    if (i + 100 < final.length) await new Promise((res) => setTimeout(res, 1000));
  }
  return { skipped: false, orgs: considered, sent: ok, failed: fail, test };
}
