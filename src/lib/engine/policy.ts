/*
  THE POLICY ENGINE — who decides whether Cortex may act, and on what terms.

  A pure function. It is given the action definition, the validated
  arguments, the owner's standing instruction for that action (if any), and
  how much of today's allowance has already been used. It returns a verdict
  and a sentence explaining it. It touches no database and calls no model, so
  scripts/test-actions-engine.mjs can run it against every combination that
  matters and every mutation that must fail.

  ============================================================================
  THE ORDER OF PRECEDENCE
  ============================================================================

    1. blocked          — the owner said never. Wins over everything.
    2. no policy row    — the catalogue default applies. For anything that
                          changes state that is 'approve'. Only exports and
                          "do less" actions default to auto.
    3. mode = approve   — a human taps.
    4. mode = auto      — but ONLY within caps, and for outbound/money actions
                          caps are mandatory. Any cap exceeded → 'approve',
                          not 'blocked': the owner still gets to say yes to
                          this one by hand. A cap is a limit on automation,
                          not on the action.

  "Within caps" is evaluated with what the ledger says has already happened
  TODAY, so the fifth reminder of a five-a-day allowance goes auto and the
  sixth waits for a person. The count comes from the ledger, not a counter.

  ============================================================================
  WHY CAPS ARE RE-CHECKED AT EXECUTION TIME TOO
  ============================================================================

  decide() runs when a proposal is created. If a batch of twenty proposals
  arrives at once, each one sees the same "used today" figure and all twenty
  pass a cap of five. So the executor calls decide() again immediately before
  acting, with a fresh count, and refuses — downgrading to 'approve' — if the
  answer has changed. Two checks, same function, no second implementation to
  drift.
*/
import type { ActionDef, Effect } from "./catalogue";

/*
  Type-only import above, on purpose. scripts/test-actions-engine.mjs runs
  this file under node --experimental-strip-types, which erases `import type`
  but needs an explicit .ts extension on any VALUE import — and Next's
  TypeScript config does not allow .ts extensions in import paths. So the two
  small value helpers the engine needs live here, where the policy is, and
  catalogue.ts stays a pure data module with no imports at all.
*/

/** Effects that may never be 'auto' without caps — enforced in schema AND here. */
export const CAPPED_EFFECTS: ReadonlySet<Effect> = new Set<Effect>(["outbound", "money"]);

/** The rupee figure a cap compares against, if the action carries one. */
export function rupeesOf(def: ActionDef, args: Record<string, unknown>): number | null {
  const r = def.blastRadius.rupees;
  if (r === "arg:amount") {
    const n = Number(args.amount);
    return Number.isFinite(n) ? n : null;
  }
  return typeof r === "number" ? r : null;
}

export type Mode = "approve" | "auto" | "blocked";

export type Caps = {
  max_amount_inr: number | null;
  max_per_day: number | null;
  known_parties_only: boolean;
};

export type Policy = { mode: Mode; caps: Caps };

export type Usage = {
  /** Executions of this action with status 'done' since local midnight. */
  doneToday: number;
  /** Whether the party on this proposal has been dealt with before (any prior done action naming them). */
  partyKnown?: boolean;
};

export type Verdict = { verdict: "auto" | "approve" | "blocked"; reason: string };

/** Which actions the schema and this engine insist have caps before 'auto'. */
export function requiresCaps(def: ActionDef): boolean {
  return CAPPED_EFFECTS.has(def.effect);
}

/**
 * Normalise a stored policy. Nulls and garbage become "no cap set", never
 * "cap of zero" — the difference between an owner who set nothing and one who
 * set zero is exactly the kind of thing that must not be invented here.
 */
export function normaliseCaps(raw: unknown): Caps {
  const c = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    max_amount_inr: num(c.max_amount_inr),
    max_per_day: num(c.max_per_day),
    known_parties_only: c.known_parties_only === true,
  };
}

export function decide(
  def: ActionDef,
  args: Record<string, unknown>,
  policy: Policy | null,
  usage: Usage,
): Verdict {
  /*
    1. Blocked wins — whether the owner set it or the catalogue defaults to it.
       One branch, not two: an earlier draft checked policy?.mode first and the
       resolved mode second, which made the first check redundant and let a
       mutation that deleted it pass the suite. A guard that can be deleted
       without a test noticing is not guarding anything.
  */
  const mode: Mode = policy?.mode ?? def.defaultMode;
  if (mode === "blocked") {
    return {
      verdict: "blocked",
      reason: policy ? `${def.title} is switched off for this workspace.` : `${def.title} is not enabled.`,
    };
  }

  /* 2. The resolved mode (owner's rule, else the catalogue default). */
  if (mode === "approve") {
    return {
      verdict: "approve",
      reason: policy
        ? "Your rule for this action is: ask me first."
        : def.reversible
          ? "Nothing runs on its own until you allow it. This one can be undone."
          : "Nothing runs on its own until you allow it. This one cannot be undone.",
    };
  }

  /* 3. mode === "auto" — only within caps. */
  const caps = normaliseCaps(policy?.caps);

  if (requiresCaps(def) && (caps.max_per_day === null || caps.max_per_day <= 0)) {
    /*
      Belt to the schema's braces. The CHECK constraint on action_policies
      should make this row impossible; if it exists anyway (constraint
      dropped, row inserted by hand), refuse to automate rather than trust it.
    */
    return {
      verdict: "approve",
      reason: `${def.title} ${def.effect === "outbound" ? "sends something to a third party" : "affects money"}, so it can only run on its own with a daily limit. None is set.`,
    };
  }

  if (caps.max_per_day !== null && usage.doneToday >= caps.max_per_day) {
    return {
      verdict: "approve",
      reason: `Today's limit of ${caps.max_per_day} for ${def.title.toLowerCase()} has been used (${usage.doneToday} done). This one needs a tap.`,
    };
  }

  const rupees = rupeesOf(def, args);
  if (caps.max_amount_inr !== null) {
    const ceiling: number = caps.max_amount_inr;
    if (rupees === null) {
      /*
        The owner set a rupee ceiling and this proposal carries no amount to
        compare. Automating it would be enforcing the cap on nothing.
      */
      return { verdict: "approve", reason: `You set a ₹${fmt(ceiling)} ceiling, and this proposal has no amount to check it against.` };
    }
    if (rupees > ceiling) {
      return { verdict: "approve", reason: `₹${fmt(rupees)} is above your ₹${fmt(ceiling)} ceiling for automatic ${def.title.toLowerCase()}.` };
    }
  }

  if (caps.known_parties_only && usage.partyKnown !== true) {
    return { verdict: "approve", reason: "Your rule allows automation only for parties Cortex has dealt with before. This one is new." };
  }

  return {
    verdict: "auto",
    reason: policy
      ? `Within your rule: ${describeCaps(caps)}.`
      : `${def.title} runs on its own by default — it only produces something for you, or makes Cortex do less.`,
  };
}

export function describeCaps(caps: Caps): string {
  const parts: string[] = [];
  if (caps.max_per_day !== null) parts.push(`up to ${caps.max_per_day} a day`);
  if (caps.max_amount_inr !== null) parts.push(`up to ₹${fmt(caps.max_amount_inr)} each`);
  if (caps.known_parties_only) parts.push("known parties only");
  return parts.length ? parts.join(", ") : "no limits set";
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

/* ------------------------------------------------------------- who asked */
/*
  TWO GATES decide() cannot see, applied after it. Both can only turn an
  "auto" into an "approve" — never the other way, never into "blocked".

  1. RANK. minRank used to gate only the human approval. The auto path never
     asked who was proposing, so a viewer could say "stop chasing Acme" in
     chat and add_do_not_contact (minRank manager, default auto) ran at once.
     Now a proposer below the action's minRank can ask, but not run: the
     proposal waits for someone with that rank.

  2. CHAT WITHOUT A RULE. The chat model reads text that people outside the
     team can write — customer names synced from a store, a pasted review.
     An instruction hidden in that text could make the model propose an
     action. A catalogue default of "auto" is a default, not the owner's
     decision, so from chat it does not apply: an internal change proposed in
     chat waits for a tap unless the owner has set an explicit rule for that
     action. Exports change no data and stay automatic.

  3. SUSPICIOUS TEXT (LLM01). The proposal — its arguments, rationale or
     evidence, or anything a tool returned during the run that produced it —
     contained instruction-shaped text (ai/untrusted.ts). Whatever the rules
     say, a human looks first, and the reason names what was found.

  4. THE ASSISTANT NEVER MOVES MONEY OR CONTACTS ANYONE ON ITS OWN. A money or
     outbound action proposed from chat waits for a tap even when the owner
     has an explicit auto rule for it. The rule still governs workflows and
     autopilot, which act on rows, not on a model's reading of text someone
     else wrote. This is the confused-deputy line: the agent's suggestion is
     never the same thing as the owner's authority.

  5. TAINT. Any other source that read third-party data before proposing
     (`tainted`) gets the same treatment for money and outbound effects.

  Pure, like decide(), so the suite executes it.
*/
export const RANK: Readonly<Record<string, number>> = Object.freeze({ viewer: 1, analyst: 2, manager: 3, admin: 4, owner: 5 });

export function gateVerdict(
  verdict: Verdict,
  def: ActionDef,
  policy: Policy | null,
  who: { source: string; actorRole?: string | null; tainted?: boolean; suspicious?: readonly string[] },
): Verdict {
  if (verdict.verdict !== "auto") return verdict;
  if (who.suspicious && who.suspicious.length) {
    return { verdict: "approve", reason: `Cortex read text that looks like instructions to an AI (${who.suspicious.slice(0, 3).join("; ")}) before proposing this, so it waits for you. Check it is what you want.` };
  }
  if (who.actorRole !== undefined) {
    const have = RANK[String(who.actorRole || "")] || 0;
    const need = RANK[def.minRank] || 0;
    if (have < need) {
      return { verdict: "approve", reason: `Your role can ask for this but not run it on its own — someone with ${def.minRank} rights needs to approve it.` };
    }
  }
  if (who.source === "chat" && CAPPED_EFFECTS.has(def.effect)) {
    return { verdict: "approve", reason: `Suggested by the assistant, and it ${def.effect === "money" ? "changes money records" : "contacts someone outside your team"} — the assistant never does that on its own, whatever the rule. It waits for your tap.` };
  }
  if (who.tainted && CAPPED_EFFECTS.has(def.effect)) {
    return { verdict: "approve", reason: "Proposed after reading data written outside your team, and it moves money or contacts someone — it waits for your tap." };
  }
  if (who.source === "chat" && !policy && def.effect !== "export") {
    return { verdict: "approve", reason: "Suggested in chat. Chat can draw on text written outside your team, so actions it proposes wait for you unless you set a rule for this action." };
  }
  return verdict;
}

/* ------------------------------------------------------- earned autonomy */
/*
  "APPROVE-FIRST, EARN AUTONOMY" — the trust model the owner chose. The
  approve-first half has existed since the ledger shipped; nothing ever
  offered the earn-autonomy half. This reads the ledger and, for an action
  the owner keeps approving and never rejects or undoes, suggests letting
  Cortex do it on its own — with caps drawn from what the owner actually
  approved, never looser.

  Rules, all from the owner's own decisions in the last 60 days:
    · at least MIN_APPROVALS human approvals of this action
    · zero rejections and zero undos (one "no" resets the case)
    · not already auto or blocked by an explicit rule
    · daily cap = the busiest day they approved (1..10); amount cap = the
      largest amount they approved — both only where the action has them
  Suggestions only. Nothing changes until an admin presses the button, and
  the existing setPolicy() constraint still refuses auto-without-cap.
*/
export const MIN_APPROVALS = 5;

export type HistoryRow = { action: string; status: string; policy_verdict: string | null; decided_by: string | null; created_at: string; args: Record<string, unknown> | null };
export type AutonomySuggestion = { action: string; approvals: number; caps: { max_per_day: number | null; max_amount_inr: number | null; known_parties_only: boolean }; why: string };

export function suggestAutonomy(
  history: HistoryRow[],
  policies: Array<{ action: string; mode: Mode }>,
  catalogue: Readonly<Record<string, ActionDef>>,
  nowMs = Date.now(),
): AutonomySuggestion[] {
  const since = nowMs - 60 * 86_400_000;
  const byAction = new Map<string, HistoryRow[]>();
  for (const h of history) {
    if (Date.parse(h.created_at) < since) continue;
    if (!byAction.has(h.action)) byAction.set(h.action, []);
    byAction.get(h.action)!.push(h);
  }
  const explicit = new Map(policies.map((p) => [p.action, p.mode]));
  const out: AutonomySuggestion[] = [];
  for (const [action, rows] of Array.from(byAction)) {
    const def = catalogue[action];
    if (!def) continue;
    const mode = explicit.get(action);
    if (mode === "auto" || mode === "blocked") continue;
    if (def.defaultMode === "auto" && !mode) continue; // already autonomous by default
    if (rows.some((r) => r.status === "rejected" || r.status === "undone")) continue;
    const approved = rows.filter((r) => r.policy_verdict === "approve" && r.decided_by && ["approved", "executing", "done", "failed"].includes(r.status));
    if (approved.length < MIN_APPROVALS) continue;

    const perDay = new Map<string, number>();
    for (const r of approved) { const d = new Date(Date.parse(r.created_at) + 5.5 * 3_600_000).toISOString().slice(0, 10); perDay.set(d, (perDay.get(d) || 0) + 1); }
    const busiest = Math.max(...Array.from(perDay.values()));
    const capped = CAPPED_EFFECTS.has(def.effect);
    const amounts = approved.map((r) => rupeesOf(def, r.args || {})).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    const caps = {
      max_per_day: Math.max(1, Math.min(10, busiest)),
      max_amount_inr: def.blastRadius.rupees && amounts.length ? Math.max(...amounts) : null,
      known_parties_only: capped,
    };
    out.push({
      action, approvals: approved.length, caps,
      why: `You approved this ${approved.length} times in the last 60 days and never rejected or undid it.`,
    });
  }
  return out.sort((a, b) => b.approvals - a.approvals);
}
