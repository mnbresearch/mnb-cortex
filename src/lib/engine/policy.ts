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
