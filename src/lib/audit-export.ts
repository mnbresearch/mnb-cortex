/*
  AUDIT EXPORT — one CSV of who did what in a workspace.

  Enterprise buyers ask for this in every security review: "can we get the
  audit trail out, for our own records and our auditors?" The rows already
  exist in five tables (activity, the Actions ledger, API key events, billing
  log, credit ledger); this module turns them into one time-ordered sheet.

  CSV, not JSON, because the person who asks for it opens it in Excel. Every
  cell that Excel would treat as a formula (= + - @, tab, CR) is prefixed with
  an apostrophe — rows carry customer-written text (rationales, messages), and
  a CSV that runs a formula on the auditor's machine is its own incident.

  Pure, no imports, so scripts/test-audit-export.mjs executes it.
*/

export type AuditRow = {
  at: string;
  source: "activity" | "action" | "api_key" | "billing" | "credits";
  actor: string;
  event: string;
  detail: string;
  ref: string;
};

export const AUDIT_MAX_DAYS = 365;
export const AUDIT_DEFAULT_DAYS = 90;
export const AUDIT_ROWS_PER_SOURCE = 10_000;

export function auditWindowDays(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return AUDIT_DEFAULT_DAYS;
  return Math.min(AUDIT_MAX_DAYS, n);
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const j = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try { const t = JSON.stringify(v); return t === "{}" || t === "[]" ? "" : t; } catch { return ""; }
};
const who = (id: unknown, names: Map<string, string>, fallback = "") => {
  const k = s(id);
  if (!k) return fallback;
  return names.get(k) || k;
};

export type AuditSources = {
  activity?: any[];
  actions?: any[];
  apiKeys?: any[];
  billing?: any[];
  credits?: any[];
};

/** Every source normalised to one shape, newest first. */
export function auditRows(src: AuditSources, names: Map<string, string> = new Map()): AuditRow[] {
  const out: AuditRow[] = [];
  for (const r of src.activity || []) {
    out.push({ at: s(r.created_at), source: "activity", actor: "", event: s(r.type) || "activity", detail: s(r.message), ref: s(r.id) });
  }
  for (const r of src.actions || []) {
    const decided = r.decided_by ? ` · decided by ${who(r.decided_by, names)}${r.decided_at ? " at " + s(r.decided_at) : ""}` : "";
    const err = r.error ? ` · error: ${s(r.error)}` : "";
    out.push({
      at: s(r.created_at), source: "action",
      actor: who(r.proposed_by, names, s(r.source) || "cortex"),
      event: `${s(r.action)} → ${s(r.status)}`,
      detail: `${s(r.rationale)}${r.policy_verdict ? ` · policy: ${s(r.policy_verdict)}` : ""}${decided}${err}`.trim(),
      ref: s(r.id),
    });
  }
  for (const r of src.apiKeys || []) {
    out.push({ at: s(r.created_at), source: "api_key", actor: who(r.actor, names), event: `key ${s(r.event)}`, detail: [s(r.key_prefix), j(r.detail)].filter(Boolean).join(" · "), ref: s(r.key_id || r.id) });
  }
  for (const r of src.billing || []) {
    out.push({ at: s(r.created_at), source: "billing", actor: who(r.actor, names), event: s(r.action), detail: j(r.detail), ref: s(r.id) });
  }
  for (const r of src.credits || []) {
    const d = Number(r.delta);
    out.push({
      at: s(r.created_at), source: "credits", actor: who(r.user_id, names),
      event: `${d >= 0 ? "+" : ""}${Number.isFinite(d) ? d : s(r.delta)} credits`,
      detail: [s(r.reason), r.balance_after !== null && r.balance_after !== undefined ? `balance ${s(r.balance_after)}` : ""].filter(Boolean).join(" · "),
      ref: s(r.id),
    });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.ref.localeCompare(b.ref)));
  return out;
}

/** One CSV cell: formula-safe and RFC 4180 quoted. */
export function csvCell(v: unknown): string {
  let t = s(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  if (/[",\r\n]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
  return t;
}

export const AUDIT_COLUMNS: (keyof AuditRow)[] = ["at", "source", "actor", "event", "detail", "ref"];

export function auditCsv(rows: AuditRow[]): string {
  const head = AUDIT_COLUMNS.join(",");
  return "﻿" + [head, ...rows.map((r) => AUDIT_COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/** Actor ids worth resolving to a name (uuid-shaped, distinct, capped). */
export function actorIds(src: AuditSources, cap = 200): string[] {
  const ids = new Set<string>();
  const add = (v: unknown) => { const k = s(v); if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) ids.add(k); };
  for (const r of src.actions || []) { add(r.proposed_by); add(r.decided_by); }
  for (const r of src.apiKeys || []) add(r.actor);
  for (const r of src.billing || []) add(r.actor);
  for (const r of src.credits || []) add(r.user_id);
  return [...ids].slice(0, cap);
}
