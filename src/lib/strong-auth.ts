import "server-only";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { strongAuthVerdict, parseRedaction, type Aal, type StrongAuthVerdict, type RedactionLevel } from "@/lib/strong-auth-rules";

/*
  The I/O half of step-up authentication; the rule is strong-auth-rules.ts.

  The assurance level comes from Supabase Auth itself
  (auth.mfa.getAuthenticatorAssuranceLevel reads the `aal` claim of the
  session's JWT, which only Supabase can mint), never from anything the
  browser sends.

  The workspace settings are read with the service role and default to the
  STRICT value when they cannot be read — before 2026_zzzu is applied, or if
  the read fails — so a missing column can never be the reason a check passed.
*/

export type SecuritySettings = { requireMfa: boolean; redaction: RedactionLevel; migrated: boolean };

export async function securitySettings(orgId: string | null | undefined): Promise<SecuritySettings> {
  const strict: SecuritySettings = { requireMfa: true, redaction: "pii", migrated: false };
  if (!orgId) return strict;
  try {
    const svc = serviceClient();
    if (!svc) return strict;
    const { data, error } = await svc.from("organizations").select("require_mfa_high_impact, ai_redaction").eq("id", orgId).maybeSingle();
    if (error || !data) return strict;
    return { requireMfa: (data as any).require_mfa_high_impact !== false, redaction: parseRedaction((data as any).ai_redaction), migrated: true };
  } catch { return strict; }
}

export async function assurance(): Promise<{ current: Aal | null; next: Aal | null }> {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    const lvl = (v: unknown): Aal | null => (v === "aal1" || v === "aal2" ? v : null);
    return { current: lvl(data?.currentLevel), next: lvl(data?.nextLevel) };
  } catch { return { current: null, next: null }; }
}

/** Gate a high-impact operation. `what` completes "To …, confirm it's you". */
export async function requireStrongAuth(orgId: string, what: string): Promise<StrongAuthVerdict> {
  const [{ requireMfa }, a] = await Promise.all([securitySettings(orgId), assurance()]);
  return strongAuthVerdict({ required: requireMfa, current: a.current, next: a.next }, what);
}

/** The session's level for recording on an approval that did not need step-up. */
export async function currentAal(): Promise<Aal> {
  return (await assurance()).current === "aal2" ? "aal2" : "aal1";
}
