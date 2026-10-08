/*
  STEP-UP AUTHENTICATION — the rule, kept pure so it is executed by
  scripts/test-strong-auth.mjs. The I/O lives in strong-auth.ts.

  "High impact" means: approving or undoing an action that moves money or
  contacts someone outside the team, letting such an action run on its own,
  issuing an API key, adding a webhook, connecting an integration, approving
  a collections message, and loosening any of these security settings.

  For those, a password-only session is not enough when the workspace requires
  it (the default): the session must have been verified with a second factor
  (Supabase "aal2"). Someone who has stolen or guessed a password can read,
  but cannot move money, message a customer, or open a data pipe out.
*/
export type Aal = "aal1" | "aal2";

export type StrongAuthInput = {
  /** organizations.require_mfa_high_impact — true unless the owner turned it off. */
  required: boolean;
  /** The session's assurance level now. null = not signed in. */
  current: Aal | null;
  /** The highest level this user could reach (aal2 if they have a verified factor). */
  next: Aal | null;
};

export type StrongAuthVerdict =
  | { ok: true; aal: Aal }
  | { ok: false; reason: "signed-out" | "enrol" | "verify"; message: string };

export const SECURITY_PAGE = "/settings/security";

export function strongAuthVerdict(i: StrongAuthInput, what: string): StrongAuthVerdict {
  if (i.current !== "aal1" && i.current !== "aal2") {
    return { ok: false, reason: "signed-out", message: `Sign in to ${what}.` };
  }
  if (i.current === "aal2") return { ok: true, aal: "aal2" };
  if (!i.required) return { ok: true, aal: "aal1" };
  if (i.next === "aal2") {
    return { ok: false, reason: "verify", message: `To ${what}, confirm it's you with the 6-digit code from your authenticator app — Settings → Security (${SECURITY_PAGE}). It lasts for this sign-in.` };
  }
  return { ok: false, reason: "enrol", message: `To ${what}, this workspace requires two-step sign-in. Turn it on under Settings → Security (${SECURITY_PAGE}) — it takes a minute with any authenticator app.` };
}

export const REDACTION_LEVELS = ["off", "pii", "strict"] as const;
export type RedactionLevel = (typeof REDACTION_LEVELS)[number];

export function parseRedaction(v: unknown): RedactionLevel {
  return (REDACTION_LEVELS as readonly string[]).includes(String(v)) ? (v as RedactionLevel) : "pii";
}

/** A change that makes the workspace less protected — it needs a second factor even when MFA is otherwise optional. */
export function isLoosening(change: { mfaFrom: boolean; mfaTo: boolean; redactionFrom: RedactionLevel; redactionTo: RedactionLevel }): boolean {
  const rank = (r: RedactionLevel) => REDACTION_LEVELS.indexOf(r);
  return (change.mfaFrom && !change.mfaTo) || rank(change.redactionTo) < rank(change.redactionFrom);
}
