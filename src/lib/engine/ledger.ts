import "server-only";
import { createHash } from "crypto";
import { serviceClient } from "@/lib/supabase/server";
import { CATALOGUE_BY_KEY, isActionKey, validateArgs, type ActionDef } from "./catalogue";
import { scanForInjection } from "@/lib/ai/untrusted";
import { decide, gateVerdict, suggestAutonomy, normaliseCaps, requiresCaps, type Policy, type Usage, type Verdict } from "./policy";
import { HANDLERS, undoHandler } from "./handlers";

/*
  THE LEDGER — the only way an action gets from "Cortex wants to" to "done".

  Four verbs, in order: propose → (decide) → execute → undo. Every one is a
  row transition on action_proposals, and every transition that matters is a
  CONDITIONAL update whose returned row count is checked. PostgREST reports a
  zero-row update as success; a ledger that trusted "no error" would let two
  workers execute the same proposal, or execute one a human had just rejected.

  Nothing here resolves the workspace from a request. Callers (server actions,
  the chat tool, the workflow verb, the cron) pass an orgId they obtained from
  the session or the cron's own scope, plus the actor if there is one.
*/

export type Source = "chat" | "autopilot" | "workflow" | "user" | "api";

export type Proposal = {
  id: string; org_id: string; action: string; args: Record<string, unknown>;
  rationale: string | null; evidence: unknown[]; source: Source; proposed_by: string | null;
  status: string; policy_verdict: Verdict["verdict"] | null; policy_reason: string | null;
  decided_by: string | null; decided_at: string | null; executed_at: string | null;
  result: Record<string, unknown> | null; error: string | null;
  undo: Record<string, unknown> | null; undone_at: string | null;
  idempotency_key: string; expires_at: string; created_at: string;
};

const svcOrThrow = () => {
  const svc = serviceClient();
  if (!svc) throw new Error("Service role is not configured.");
  return svc;
};

/*
  EVERY STATUS WRITE READS ITS ROW BACK — including the bookkeeping ones.

  The claim (approved → executing) was always row-count-checked. The writes
  AFTER it — failed, done, blocked, undo-failed — were not, on the reasoning
  that a row we had just claimed must still exist. scripts/test-silent-writes
  rejected that reasoning, correctly: it holds a ceiling on the number of
  `.update()` calls in src/ that bind an error and never select back, and
  these five raised it. "Must still exist" is exactly the assumption that
  turns a deleted-mid-flight row into a ledger entry that says "executing"
  forever while the UI says nothing.

  So: one helper. It selects back, and a zero-row result is logged as an
  error naming the proposal, because after a claim it means the ledger has
  lost a row it was in the middle of — which an operator needs to hear about,
  not a return value somebody may ignore.
*/
async function mark(id: string, orgId: string, patch: Record<string, unknown>): Promise<boolean> {
  const svc = svcOrThrow();
  const { data, error } = await svc.from("action_proposals").update(patch).eq("id", id).eq("org_id", orgId).select("id");
  if (error) { console.error(`[engine] could not update proposal ${id}: ${error.message}`); return false; }
  if (!data || data.length !== 1) { console.error(`[engine] proposal ${id} vanished mid-flight (status write touched ${data?.length ?? 0} rows)`); return false; }
  return true;
}

/** Start of today in IST, as an ISO string — every customer is in India. */
function istMidnightISO(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(), d = ist.getUTCDate();
  return new Date(Date.UTC(y, m, d) - 5.5 * 3_600_000).toISOString();
}

export async function getPolicy(orgId: string, action: string): Promise<Policy | null> {
  const svc = svcOrThrow();
  const { data } = await svc.from("action_policies").select("mode, caps").eq("org_id", orgId).eq("action", action).maybeSingle();
  if (!data) return null;
  return { mode: (data as any).mode, caps: normaliseCaps((data as any).caps) };
}

export async function getUsage(orgId: string, def: ActionDef, args: Record<string, unknown>): Promise<Usage> {
  const svc = svcOrThrow();
  const { count } = await svc.from("action_proposals")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("action", def.key).eq("status", "done")
    .gte("executed_at", istMidnightISO());

  /*
    "Known party": any prior DONE action in this workspace that named the same
    party, or the same invoice's party. Deliberately strict — a party Cortex
    has only ever READ about is not "known" for the purpose of automating a
    message to them.
  */
  let partyKnown: boolean | undefined;
  const party = typeof args.party === "string" ? args.party : null;
  const invoiceId = typeof args.invoice_id === "string" ? args.invoice_id : null;
  if (party || invoiceId) {
    let name = party;
    if (!name && invoiceId) {
      const { data: inv } = await svc.from("invoices").select("party").eq("org_id", orgId).eq("id", invoiceId).maybeSingle();
      name = (inv as any)?.party ?? null;
    }
    if (name) {
      const { normalizeCustomerName } = await import("@/lib/customer-match");
      const norm = normalizeCustomerName(name);
      const { data: prior } = await svc.from("action_proposals")
        .select("args, result").eq("org_id", orgId).eq("status", "done").limit(200);
      partyKnown = ((prior as any[]) || []).some((p) => {
        const cand = [p.args?.party, p.result?.party, p.result?.recipient_party].filter(Boolean);
        return cand.some((c) => normalizeCustomerName(String(c)) === norm);
      });
      if (!partyKnown) {
        /* A party with a sent collections message is known too. */
        const { data: threads } = await svc.from("collection_threads").select("party, attempts").eq("org_id", orgId).gt("attempts", 0).limit(500);
        partyKnown = ((threads as any[]) || []).some((t) => normalizeCustomerName(t.party) === norm);
      }
    }
  }
  return { doneToday: count || 0, partyKnown };
}

export type ProposeInput = {
  orgId: string; action: string; args: unknown; rationale?: string | null; evidence?: unknown[];
  source: Source; proposedBy?: string | null;
  /**
   * The proposer's workspace role, when a person (or something acting for one)
   * proposed it. Below the action's minRank → it can never run automatically.
   * Omit only for system sources with no person behind them.
   */
  actorRole?: string | null;
  /** The proposer read third-party data first (chat tool results, synced rows). Money/outbound then never auto-runs. */
  tainted?: boolean;
  /** Instruction-shaped text the proposer saw (ai/untrusted.ts). Anything non-empty → a human decides. */
  suspicious?: string[];
  /** Stable key so a retried cron or double-click cannot create two. Defaults to a hash of (org, action, args, day). */
  idempotencyKey?: string;
};

export type ProposeOutcome =
  | { ok: true; proposal: Proposal; verdict: Verdict; executed?: { ok: boolean; summary?: string; error?: string }; duplicate?: boolean }
  | { ok: false; error: string; problems?: string[] };

/**
 * Create a proposal, decide it, and — if the verdict is auto — execute it at
 * once. Returns the row either way so the caller can show the person what
 * happened or where it is waiting.
 */
export async function propose(input: ProposeInput): Promise<ProposeOutcome> {
  if (!isActionKey(input.action)) return { ok: false, error: `"${String(input.action)}" is not an action Cortex can take.` };
  const def = CATALOGUE_BY_KEY[input.action];
  const v = validateArgs(def, input.args);
  if (!v.ok) return { ok: false, error: "The action's details are incomplete.", problems: v.problems };

  const svc = svcOrThrow();
  const key = input.idempotencyKey || defaultKey(input.orgId, def.key, v.args);

  const [policy, usage] = await Promise.all([getPolicy(input.orgId, def.key), getUsage(input.orgId, def, v.args)]);
  /* LLM01: the proposal's own words are scanned too — an argument such as a
     customer note is stored and later read back into prompts. */
  const ownScan = scanForInjection([v.args, input.rationale ?? null, input.evidence ?? []]);
  const suspicious = Array.from(new Set([...(input.suspicious || []), ...ownScan.hits]));
  const verdict = gateVerdict(decide(def, v.args, policy, usage), def, policy, {
    source: input.source, actorRole: input.actorRole, tainted: input.tainted === true, suspicious,
  });

  const row = {
    org_id: input.orgId, action: def.key, args: v.args,
    rationale: input.rationale ?? null, evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 20) : [],
    source: input.source, proposed_by: input.proposedBy ?? null,
    status: verdict.verdict === "blocked" ? "blocked" : verdict.verdict === "auto" ? "approved" : "proposed",
    policy_verdict: verdict.verdict, policy_reason: verdict.reason,
    decided_by: null, decided_at: verdict.verdict === "auto" ? new Date().toISOString() : null,
    idempotency_key: key,
  };

  const { data, error } = await svc.from("action_proposals").insert(row).select("*").maybeSingle();
  if (error) {
    if ((error as any).code === "23505") {
      /* Scoped to this workspace: the key is unique across all of them, and an
         unscoped read once handed org B org A's row as "already proposed". */
      const { data: existing } = await svc.from("action_proposals").select("*").eq("idempotency_key", key).eq("org_id", input.orgId).maybeSingle();
      if (existing) return { ok: true, duplicate: true, proposal: existing as Proposal, verdict: { verdict: (existing as any).policy_verdict, reason: "Already proposed today." } };
      return { ok: false, error: "An identical proposal key exists in another workspace; nothing was created. Rename the step or try again." };
    }
    return { ok: false, error: `Could not record the proposal: ${error.message}` };
  }
  if (!data) return { ok: false, error: "The proposal was not recorded." };

  if (verdict.verdict === "auto") {
    const r = await execute((data as any).id, input.orgId, input.proposedBy ?? null, { recheckPolicy: true });
    const executed = r.ok ? { ok: true, summary: r.summary } : { ok: false, error: r.error };
    const { data: fresh } = await svc.from("action_proposals").select("*").eq("id", (data as any).id).maybeSingle();
    return { ok: true, proposal: (fresh || data) as Proposal, verdict, executed };
  }
  return { ok: true, proposal: data as Proposal, verdict };
}

function defaultKey(orgId: string, action: string, args: Record<string, unknown>): string {
  const day = istMidnightISO().slice(0, 10);
  const h = createHash("sha256").update(JSON.stringify([orgId, action, args, day])).digest("hex").slice(0, 32);
  return `${action}:${h}`;
}

/** A human says yes. Moves proposed → approved, then executes. */
export async function approve(id: string, orgId: string, actorId: string): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const svc = svcOrThrow();
  const { data: rows, error } = await svc.from("action_proposals")
    .update({ status: "approved", decided_by: actorId, decided_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", orgId).eq("status", "proposed").gt("expires_at", new Date().toISOString())
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!rows || rows.length !== 1) return { ok: false, error: "This proposal is no longer waiting — it may have been decided already, or expired." };
  return execute(id, orgId, actorId, { recheckPolicy: false });
}

export async function reject(id: string, orgId: string, actorId: string, note?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const svc = svcOrThrow();
  const { data: rows, error } = await svc.from("action_proposals")
    .update({ status: "rejected", decided_by: actorId, decided_at: new Date().toISOString(), error: note ? `Rejected: ${note}`.slice(0, 500) : null })
    .eq("id", id).eq("org_id", orgId).eq("status", "proposed").select("id");
  if (error) return { ok: false, error: error.message };
  if (!rows || rows.length !== 1) return { ok: false, error: "This proposal is no longer waiting." };
  return { ok: true };
}

/**
 * Run an approved proposal exactly once.
 *
 * The claim is `approved → executing` with the row count checked, so two
 * callers racing for the same row get one winner and one "already taken".
 * With recheckPolicy (the auto path), the cap is re-evaluated against a fresh
 * count immediately before acting; if it no longer passes, the row goes back
 * to `proposed` for a human instead of running.
 */
export async function execute(id: string, orgId: string, actorId: string | null, opts: { recheckPolicy: boolean }): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const svc = svcOrThrow();
  const { data: claimed, error: claimErr } = await svc.from("action_proposals")
    .update({ status: "executing" })
    .eq("id", id).eq("org_id", orgId).eq("status", "approved")
    .select("*");
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed || claimed.length !== 1) return { ok: false, error: "This proposal is not in an approved state (someone else may be running it)." };
  const p = claimed[0] as Proposal;
  const def = CATALOGUE_BY_KEY[p.action];
  if (!def) {
    await mark(id, orgId, { status: "failed", error: "Unknown action." });
    return { ok: false, error: "Unknown action." };
  }

  if (opts.recheckPolicy) {
    const [policy, usage] = await Promise.all([getPolicy(orgId, def.key), getUsage(orgId, def, p.args)]);
    const again = decide(def, p.args, policy, usage);
    if (again.verdict !== "auto") {
      await mark(id, orgId, { status: again.verdict === "blocked" ? "blocked" : "proposed", policy_verdict: again.verdict, policy_reason: `At execution: ${again.reason}`, decided_at: null });
      return { ok: false, error: again.reason };
    }
  }

  const handler = HANDLERS[def.key];
  if (!handler) {
    await mark(id, orgId, { status: "failed", error: "No handler." });
    return { ok: false, error: `No handler is wired for ${def.key}.` };
  }

  let outcome: Awaited<ReturnType<typeof handler>>;
  try {
    outcome = await handler(p.args, { orgId, proposalId: id, actorId });
  } catch (e: any) {
    outcome = { ok: false, error: e?.message || "The action threw." };
  }

  if (!outcome.ok) {
    await mark(id, orgId, { status: "failed", error: outcome.error.slice(0, 1000), executed_at: new Date().toISOString() });
    return { ok: false, error: outcome.error };
  }
  /*
    The handler has already acted. If this write fails the action HAPPENED
    but the ledger does not say so — the one outcome worse than a failure, so
    it is surfaced to the caller rather than swallowed.
  */
  const recorded = await mark(id, orgId, { status: "done", result: { ...outcome.result, summary: outcome.summary }, undo: outcome.undo, executed_at: new Date().toISOString() });
  if (!recorded) return { ok: false, error: `${outcome.summary} — but the ledger could not record it. Check the Approvals history before repeating this.` };
  return { ok: true, summary: outcome.summary };
}

export async function undo(id: string, orgId: string, actorId: string): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const svc = svcOrThrow();
  const { data: p } = await svc.from("action_proposals").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!p) return { ok: false, error: "Not found." };
  if ((p as any).status !== "done") return { ok: false, error: "Only a completed action can be undone." };
  if (!(p as any).undo) return { ok: false, error: "This action cannot be undone." };

  /* Claim: done → executing, so two undo clicks cannot both apply. */
  const { data: rows } = await svc.from("action_proposals").update({ status: "executing" }).eq("id", id).eq("org_id", orgId).eq("status", "done").select("id");
  if (!rows || rows.length !== 1) return { ok: false, error: "Already being undone." };

  const r = await undoHandler((p as any).undo, { orgId, proposalId: id, actorId });
  if (!r.ok) {
    await mark(id, orgId, { status: "done", error: `Undo failed: ${r.error}`.slice(0, 500) });
    return r;
  }
  const recorded = await mark(id, orgId, { status: "undone", undone_at: new Date().toISOString(), undone_by: actorId });
  if (!recorded) return { ok: false, error: `${r.summary} — but the ledger could not record the undo.` };
  return r;
}

export async function listProposals(orgId: string, opts: { status?: string[]; limit?: number } = {}): Promise<Proposal[]> {
  const svc = svcOrThrow();
  let q = svc.from("action_proposals").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.status?.length) q = q.in("status", opts.status);
  const { data } = await q;
  return ((data as any[]) || []) as Proposal[];
}

export async function listPolicies(orgId: string): Promise<Array<{ action: string; mode: Policy["mode"]; caps: ReturnType<typeof normaliseCaps> }>> {
  const svc = svcOrThrow();
  const { data } = await svc.from("action_policies").select("action, mode, caps").eq("org_id", orgId);
  return ((data as any[]) || []).map((r) => ({ action: r.action, mode: r.mode, caps: normaliseCaps(r.caps) }));
}

export async function setPolicy(orgId: string, action: string, mode: Policy["mode"], caps: unknown, actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isActionKey(action)) return { ok: false, error: "Unknown action." };
  const def = CATALOGUE_BY_KEY[action];
  const c = normaliseCaps(caps);
  if (mode === "auto" && requiresCaps(def) && (c.max_per_day === null || c.max_per_day <= 0)) {
    return { ok: false, error: `${def.title} ${def.effect === "outbound" ? "sends to a third party" : "affects money"}. To run it automatically, set a daily limit.` };
  }
  const svc = svcOrThrow();
  const { error } = await svc.from("action_policies").upsert({
    org_id: orgId, action, mode, caps: c, requires_caps: requiresCaps(def),
    updated_by: actorId, updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,action" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Sweep: expire stale proposals. Called from the nightly cron. */
export async function expireStale(orgId?: string): Promise<number> {
  const svc = svcOrThrow();
  let q = svc.from("action_proposals").update({ status: "expired" }).eq("status", "proposed").lt("expires_at", new Date().toISOString());
  if (orgId) q = q.eq("org_id", orgId);
  const { data } = await q.select("id");
  return data?.length || 0;
}

/**
 * What to tell a person when their proposal turned out to be one already made
 * today. Without this every caller said "queued for approval" — including when
 * the earlier one had already run, failed, or been rejected.
 */
export function describeExisting(p: Proposal): { ok: boolean; message: string } {
  switch (p.status) {
    case "done": return { ok: true, message: "Already done earlier today — see Approvals history." };
    case "proposed": return { ok: true, message: "Already waiting for approval in Approvals." };
    case "approved": case "executing": return { ok: true, message: "Already approved and running." };
    case "rejected": return { ok: false, message: "This exact action was rejected earlier today; it was not proposed again." };
    case "failed": return { ok: false, message: `This exact action failed earlier today${p.error ? `: ${p.error}` : ""}. Fix the cause and try tomorrow, or change the details.` };
    case "blocked": return { ok: false, message: p.policy_reason || "This action is blocked in this workspace." };
    case "expired": return { ok: false, message: "This exact action expired earlier today without a decision." };
    case "undone": return { ok: true, message: "This exact action ran earlier today and was undone." };
    default: return { ok: true, message: `Already proposed today (${p.status}).` };
  }
}

/**
 * The action a stored proposal is for, read from the ledger. Role checks on
 * approve/reject/undo use THIS, never an action name the browser sent — the
 * form value let an analyst approve an admin-only payment by labelling it as
 * an export.
 */
export async function storedAction(id: string, orgId: string): Promise<string | null> {
  const svc = svcOrThrow();
  const { data } = await svc.from("action_proposals").select("action").eq("id", id).eq("org_id", orgId).maybeSingle();
  return (data as any)?.action ?? null;
}

/** Earned-autonomy suggestions for a workspace, computed from its own ledger. See policy.suggestAutonomy. */
export async function autonomySuggestions(orgId: string) {
  const svc = svcOrThrow();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [{ data: hist }, policies] = await Promise.all([
    svc.from("action_proposals").select("action, status, policy_verdict, decided_by, created_at, args")
      .eq("org_id", orgId).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    listPolicies(orgId),
  ]);
  return suggestAutonomy((hist as any[]) || [], policies, CATALOGUE_BY_KEY);
}
