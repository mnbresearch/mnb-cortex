import { NextResponse } from "next/server";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { ROLE_RANK } from "@/lib/roles";
import { isMissingTable } from "@/app/api/export/collect";
import { auditRows, auditCsv, auditWindowDays, actorIds, AUDIT_ROWS_PER_SOURCE, type AuditSources } from "@/lib/audit-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  GET /api/workspace/audit-export?days=90 — Settings → Security → "Download
  audit log". One CSV of who did what: activity, every Actions-ledger
  proposal and decision, API key events, billing changes and credit movements.

  Owners and admins only — it names people and shows billing. Read with the
  admin's OWN session, so RLS still decides what comes back; the service role
  is used only to turn user ids into email addresses. A table that is not
  migrated on this database is skipped and named in the response header; any
  other read error fails the whole download rather than handing an auditor a
  file that silently lacks a source.

  Not plan-gated: it is the workspace's own record, and leaving with it is a
  right, like the JSON export.
*/
const SOURCES: { key: keyof AuditSources; table: string; cols: string }[] = [
  { key: "activity", table: "activity", cols: "id, type, message, created_at" },
  { key: "actions", table: "action_proposals", cols: "id, action, status, source, rationale, proposed_by, policy_verdict, decided_by, decided_at, error, created_at" },
  { key: "apiKeys", table: "api_key_events", cols: "id, key_id, key_prefix, event, actor, detail, created_at" },
  { key: "billing", table: "org_billing_log", cols: "id, actor, action, detail, created_at" },
  { key: "credits", table: "credit_ledger", cols: "id, user_id, delta, balance_after, reason, created_at" },
];

export async function GET(req: Request) {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sb = await createClient();
  const { data: m } = await sb.from("memberships").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  const role = String((m as any)?.role || "viewer");
  if ((ROLE_RANK[role] || 0) < ROLE_RANK.admin) {
    return NextResponse.json({ error: `The audit log is for owners and admins (you are ${role}).` }, { status: 403 });
  }

  const days = auditWindowDays(new URL(req.url).searchParams.get("days"));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const src: AuditSources = {};
  const absent: string[] = [];
  let truncated = false;
  for (const s of SOURCES) {
    const { data, error } = await sb.from(s.table).select(s.cols).eq("org_id", orgId).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(AUDIT_ROWS_PER_SOURCE);
    if (error) {
      if (isMissingTable(error)) { absent.push(s.table); continue; }
      return NextResponse.json({ error: `Couldn't read ${s.table}: ${error.message}. Nothing was downloaded — please try again.` }, { status: 500 });
    }
    const rows = (data as any[]) || [];
    if (rows.length >= AUDIT_ROWS_PER_SOURCE) truncated = true;
    (src as any)[s.key] = rows;
  }

  /* user ids → email, for the people in these rows only. Best effort: a failed
     lookup leaves the id, which is still a valid audit reference. */
  const names = new Map<string, string>();
  const svc = serviceClient();
  if (svc) {
    for (const id of actorIds(src)) {
      try {
        const { data } = await svc.auth.admin.getUserById(id);
        if (data?.user?.email) names.set(id, data.user.email);
      } catch { /* keep the id */ }
    }
  }

  const rows = auditRows(src, names);
  try { await sb.from("activity").insert({ org_id: orgId, type: "security", message: `Audit log downloaded (${days} days, ${rows.length} rows) by ${user.email || user.id}` }); } catch { /* the download itself is still valid */ }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(auditCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cortex-audit-${stamp}-${days}d.csv"`,
      "Cache-Control": "no-store",
      "X-Audit-Rows": String(rows.length),
      "X-Audit-Absent": absent.join(","),
      "X-Audit-Truncated": truncated ? "1" : "0",
    },
  });
}
