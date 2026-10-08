"use server";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/roles";
import { serviceClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { securitySettings, assurance } from "@/lib/strong-auth";
import { isLoosening, parseRedaction } from "@/lib/strong-auth-rules";

/*
  The workspace's two security settings. Admin only. Both columns are
  protected by cortex_guard_org_billing() (2026_zzzu), so this service-role
  write — after the checks below — is the only way they change.

  Tightening is always allowed. LOOSENING (switching the MFA requirement off,
  or lowering AI redaction) needs a second factor even if the workspace does
  not otherwise require one: lowering protection is exactly what someone
  holding a stolen password would do first.
*/
export async function saveSecuritySettings(fd: FormData): Promise<ActionResult> {
  const { orgId } = await assertRole("admin");
  const before = await securitySettings(orgId);
  if (!before.migrated) return fail("These settings need a one-time database update (2026_zzzu_security_controls.sql). Until then Cortex uses the strict defaults: second factor required, personal data redacted.");

  const requireMfa = String(fd.get("require_mfa") || "") === "on";
  const redaction = parseRedaction(fd.get("ai_redaction"));

  if (isLoosening({ mfaFrom: before.requireMfa, mfaTo: requireMfa, redactionFrom: before.redaction, redactionTo: redaction })) {
    const a = await assurance();
    if (a.current !== "aal2") {
      return fail(a.next === "aal2"
        ? "Lowering a protection needs your second factor. Enter your authenticator code above, then save again."
        : "Lowering a protection needs a second factor. Turn on two-step sign-in above first.");
    }
  }

  const svc = serviceClient();
  if (!svc) return fail("The server cannot save settings right now (service role missing).");
  const { data, error } = await svc.from("organizations")
    .update({ require_mfa_high_impact: requireMfa, ai_redaction: redaction })
    .eq("id", orgId).select("id");
  if (error) return fail(`Could not save: ${error.message}`);
  if (!data || data.length !== 1) return fail("Could not save: the workspace was not found.");
  revalidatePath("/settings/security");
  return ok("Saved.");
}
