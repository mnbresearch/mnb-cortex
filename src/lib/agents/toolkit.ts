import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { TOOL_DECLARATIONS, runTool, type RunGuard, type ToolResult } from "@/lib/ai/tools";
import { upcomingDeadlines, splitByProfile, istISO } from "@/lib/statutory";
import { parseProfile, UNKNOWN_PROFILE } from "@/lib/statutory-profile";
import { recall, remember } from "@/lib/memory";
import { scoreBook, type RfmInput } from "@/lib/rfm";
import { scanForInjection } from "@/lib/ai/untrusted";
import { AGENT_TOOL_DECLARATIONS, type AgentToolName } from "@/lib/agents/tool-specs";
import type { AgentToolCall } from "@/lib/ai/agent-scope";

/*
  THE AGENT TOOLKIT — what an Agent Workspace agent can look up or do.

  Two kinds of tool, one dispatcher:

    1. The nine chat tools from lib/ai/tools.ts, unchanged: the eight read-only
       lookups and propose_action (the one write, into the approval queue).
       Agents reach them through runTool(), so every rule that file enforces —
       org scoping, the row cap, the injection scan, the daily proposal flood
       guard, the role check — applies to agents exactly as it does to chat.

    2. Agent-only tools that WRAP calculations the product already does on its
       own pages: the 43B(h) exposure RPC, the statutory calendar filtered by
       the workspace's own profile, the KPI snapshot, RFM segments and Cortex
       Memory. No new business logic lives here — a figure an agent quotes is
       the figure the module page shows.

  Security model, identical to tools.ts:
    - orgId comes from the caller (the task row the server loaded). Never from
      the model's arguments.
    - Every query filters on org_id. Rows are capped.
    - The only writes are propose_action (via runTool → ledger.propose) and
      remember_fact, which writes ONE memory row labelled source "agent" so the
      owner can always tell what Cortex inferred from what they told it.
*/

const MAX_ROWS = 25;
const clamp = (n: unknown, d: number, max = MAX_ROWS) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : d;
};

const CHAT_TOOL_NAMES = new Set<string>(TOOL_DECLARATIONS.map((t) => t.name));

/** Every declaration an agent could be given: the chat set plus the agent-only set. */
export const ALL_AGENT_TOOLS = [...TOOL_DECLARATIONS, ...AGENT_TOOL_DECLARATIONS] as const;

/** Declarations for a list of tool names, in the order given. Unknown names are dropped. */
export function declarationsFor(names: readonly string[]) {
  const by = new Map<string, (typeof ALL_AGENT_TOOLS)[number]>(ALL_AGENT_TOOLS.map((t) => [t.name, t]));
  return names.map((n) => by.get(n)).filter(Boolean) as (typeof ALL_AGENT_TOOLS)[number][];
}

/** Run one tool for an agent step, and record it on the step's trace. */
export async function runAgentTool(
  name: string, args: any, ctx: { orgId: string; userId: string | null; trace: AgentToolCall[] }, guard: RunGuard,
): Promise<ToolResult> {
  let result: ToolResult;
  try {
    result = CHAT_TOOL_NAMES.has(name)
      ? await runTool(name, args, ctx.orgId, ctx.userId, guard)
      : await agentLookup(name as AgentToolName, args, ctx.orgId, ctx.userId);
  } catch (e: any) {
    result = { ok: false, error: e?.message || "Lookup failed." };
  }
  /* Agent-only reads carry third-party text too (supplier names, memories): same taint rule as chat. */
  if (!CHAT_TOOL_NAMES.has(name) && result.ok && result.rows?.length) {
    guard.tainted = true;
    for (const h of scanForInjection(result.rows).hits) if (!guard.suspicious.includes(h)) guard.suspicious.push(h);
  }
  ctx.trace.push({
    name, args: safeArgs(args), ok: result.ok,
    summary: String(result.ok ? result.summary || `${result.rows?.length ?? 0} row(s)` : result.error || "failed").slice(0, 400),
    rows: result.rows?.length ?? 0, at: Date.now(),
    /* A small sample is kept so Veritas v1 can check quoted figures against what was actually read. */
    sample: (result.rows || []).slice(0, MAX_ROWS),
  });
  return result;
}

function safeArgs(args: unknown): unknown {
  try { return JSON.parse(JSON.stringify(args ?? {}).slice(0, 800)); } catch { return {}; }
}

async function agentLookup(name: AgentToolName, args: any, orgId: string, userId: string | null): Promise<ToolResult> {
  if (!orgId) return { ok: false, error: "No workspace in context." };
  const sb: any = serviceClient();
  if (!sb) return { ok: false, error: "The database is not configured." };

  switch (name) {
    case "business_snapshot": {
      const { data } = await sb.from("health_metrics").select("metric_key, label, value, unit, delta_pct, status, as_of").eq("org_id", orgId).limit(MAX_ROWS);
      const rows = ((data as any[]) || []).map((m) => ({
        metric: m.label, value: m.value === null ? null : Number(m.value), unit: m.unit,
        change_pct: typeof m.delta_pct === "number" ? m.delta_pct : null, status: m.status, as_of: m.as_of,
      }));
      if (!rows.length) return { ok: true, rows: [], summary: "No KPIs have been computed for this workspace yet — no data has been imported. Do not invent figures." };
      return { ok: true, rows, summary: `${rows.length} KPI(s) from the workspace's own computed metrics.` };
    }

    case "msme_exposure": {
      const { data, error } = await sb.rpc("cortex_msme_exposure", { p_org: orgId });
      if (error) return { ok: false, error: `The 43B(h) calculation is unavailable: ${error.message}` };
      const all = ((data as any[]) || []).map((r) => ({
        supplier: r.party, udyam_category: r.udyam_category,
        bills_past_window: Number(r.invoice_count) || 0, amount_past_window: Number(r.total_amount) || 0,
        oldest_days: Number(r.oldest_days) || 0, window_days: Number(r.window_days) || 45, past_window: Boolean(r.past_window),
      }));
      const covered = (c: string) => c === "micro" || c === "small";
      const atRisk = all.filter((r) => covered(r.udyam_category) && r.past_window);
      const unclassified = all.filter((r) => r.udyam_category === "unclassified");
      const atRiskTotal = atRisk.reduce((n, r) => n + r.amount_past_window, 0);
      const rows = [...atRisk, ...unclassified].sort((a, b) => b.amount_past_window - a.amount_past_window).slice(0, clamp(args?.limit, 10));
      return {
        ok: true, rows,
        summary: `Section 43B(h): ₹${Math.round(atRiskTotal).toLocaleString("en-IN")} across ${atRisk.length} micro/small supplier(s) is past the payment window and at risk of disallowance. `
          + `${unclassified.length} supplier(s) are not yet classified, so their exposure is UNKNOWN, not zero.`,
      };
    }

    case "statutory_deadlines": {
      const within = clamp(args?.within_days, 21, 60);
      let profile = UNKNOWN_PROFILE;
      try {
        const { data } = await sb.from("organizations").select("statutory_profile").eq("id", orgId).maybeSingle();
        if (data) profile = parseProfile((data as any).statutory_profile);
      } catch { /* column not migrated — treat as unknown, never as "does not apply" */ }
      const { shown, hidden } = splitByProfile(upcomingDeadlines(within), profile);
      const rows = shown.map((d) => ({ deadline: d.name, what: d.what, due: istISO(d.due), days_away: d.daysAway, severity: d.severity, applies_if: d.appliesIf }));
      return { ok: true, rows, summary: `${rows.length} statutory deadline(s) in the next ${within} days for this workspace (${hidden.length} hidden because the owner said they do not apply).` };
    }

    case "customer_segments": {
      const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await sb.from("sales_orders").select("customer_name, amount, order_date, status")
        .eq("org_id", orgId).gte("order_date", since).limit(5000);
      const by = new Map<string, { n: number; v: number; last: number }>();
      for (const r of ((data as any[]) || [])) {
        if (String(r.status || "won").toLowerCase() === "lost") continue;
        const k = String(r.customer_name || "").trim(); if (!k) continue;
        const t = new Date(r.order_date || 0).getTime();
        const cur = by.get(k) || { n: 0, v: 0, last: 0 };
        cur.n += 1; cur.v += Number(r.amount) || 0; cur.last = Math.max(cur.last, t);
        by.set(k, cur);
      }
      const input: RfmInput[] = [...by.entries()].map(([name, x]) => ({
        id: name, name, recency: Math.max(0, Math.round((Date.now() - x.last) / 86_400_000)), frequency: x.n, monetary: Math.round(x.v),
      }));
      const scored = scoreBook(input);
      const want = String(args?.segment || "").toLowerCase();
      const rows = scored.filter((s) => !want || s.segment.toLowerCase().includes(want))
        .sort((a, b) => b.monetary - a.monetary).slice(0, clamp(args?.limit, 10))
        .map((s) => ({ customer: s.name, segment: s.segment, days_since_last_order: s.recency, orders_12m: s.frequency, value_12m: s.monetary }));
      const counts: Record<string, number> = {};
      for (const s of scored) counts[s.segment] = (counts[s.segment] || 0) + 1;
      return { ok: true, rows, summary: `${scored.length} customer(s) scored on the last 12 months of orders. Segments: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.` };
    }

    case "recall_memory": {
      const q = String(args?.query || "").slice(0, 200);
      const mems = await recall(orgId, q, { limit: clamp(args?.limit, 6, 12) });
      const rows = mems.map((m) => ({
        kind: m.kind, title: m.title, content: m.content.slice(0, 600), learned_on: String(m.created_at || "").slice(0, 10),
        provenance: provenanceOf(m.source),
      }));
      return { ok: true, rows, summary: rows.length ? `${rows.length} remembered item(s). Each is labelled with where it came from.` : "Nothing in memory matches." };
    }

    case "remember_fact": {
      const content = String(args?.content || "").trim().slice(0, 1000);
      if (!content) return { ok: false, error: "Nothing to remember." };
      const m = await remember({
        orgId, content, title: String(args?.title || "").slice(0, 120) || undefined,
        kind: String(args?.kind || "insight"), source: "agent", author: userId, importance: 2,
      });
      return m
        ? { ok: true, summary: `Remembered as an AI-inferred ${m.kind} (the owner can see and remove it in Memory).` }
        : { ok: false, error: "Memory is not available on this plan, or the write failed. Say so instead of claiming it was remembered." };
    }

    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

/**
 * Where a memory came from, in the three words the owner sees.
 * Derived from the existing `source` column, so no migration is needed and
 * every memory written before this file existed is labelled too.
 */
export function provenanceOf(source: string | null | undefined): "from your data" | "you told Cortex" | "AI-inferred" {
  const s = String(source || "manual").toLowerCase();
  if (/^(import|ingest|sync|data|metrics|business_data|csv|tally)/.test(s)) return "from your data";
  if (/^(manual|user|owner|note|revision)/.test(s)) return "you told Cortex";
  return "AI-inferred";
}
