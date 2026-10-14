"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { RANK } from "@/lib/engine/policy";

/**
 * Record whether a supplier has a WRITTEN agreement — the input that decides
 * the 43B(h) window (45 days with one, 15 without, under MSMED Act s.15).
 *
 * `vendors.has_written_agreement` has been `not null default true` since
 * 2026_msme_43bh.sql and nothing ever wrote it, so every supplier silently got
 * the 45-day window and the 15-day rule never applied. Migration
 * 2026_zzzz_c_msme_agreement_unknown.sql adds `written_agreement_recorded_at`:
 * until this action sets it, the agreement is UNKNOWN and the exposure uses
 * the shorter, conservative 15-day window (and the page says so).
 *
 * Gated at analyst — the same rank the database's vendors UPDATE policy
 * requires (2026_write_rank_gates.sql) — so a viewer gets a sentence, not a
 * raw RLS error. The update is checked for an error AND for a row actually
 * changed: a zero-row update is not a success.
 */
export async function setVendorAgreement(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) return { ok: false, error: "Sign in to record supplier agreements." };

  const sb = await createClient();
  const { data: mem } = await sb.from("memberships").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  const role = String((mem as any)?.role || "viewer");
  if ((RANK[role] || 0) < (RANK.analyst || 2)) {
    return { ok: false, error: `Recording a supplier agreement needs the analyst role or higher (you are ${role}).` };
  }

  const id = String(fd.get("id") ?? "").trim();
  const value = String(fd.get("has_written_agreement") ?? "").trim();
  if (!id) return { ok: false, error: "No supplier." };
  if (value !== "yes" && value !== "no") return { ok: false, error: "Choose yes or no." };

  const { data, error } = await sb.from("vendors")
    .update({ has_written_agreement: value === "yes", written_agreement_recorded_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", orgId)
    .select("id");
  if (error) {
    if (/written_agreement_recorded_at/i.test(error.message)) {
      return { ok: false, error: "This needs a database update that has not been applied yet (2026_zzzz_c_msme_agreement_unknown.sql). Nothing was saved." };
    }
    return { ok: false, error: error.message };
  }
  if (!data || (data as any[]).length === 0) {
    return { ok: false, error: "That supplier was not found in this workspace, so nothing was saved." };
  }

  revalidatePath("/msme");
  return { ok: true };
}
