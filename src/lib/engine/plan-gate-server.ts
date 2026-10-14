import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import type { Capability } from "@/lib/config";
import { capabilityVerdict, type CapabilityVerdict, type GateOrg } from "./plan-gate";

/*
  Read a workspace (and, if it is claimed by a Practice firm, the firm) with the
  service role and decide a capability. Callers choose what a READ FAILURE
  means — `readError: true` is returned alongside a refusal so a caller that
  must fail open (an integration mid-request) can tell "unknown" from "no".
*/
export async function orgCapability(orgId: string, cap: Capability): Promise<{ verdict: CapabilityVerdict; readError: boolean; plan: string }> {
  const svc = serviceClient();
  if (!svc) return { verdict: { ok: false, reason: "plan" }, readError: true, plan: "" };
  try {
    const { data, error } = await svc.from("organizations").select("*").eq("id", orgId).maybeSingle();
    if (error) return { verdict: { ok: false, reason: "plan" }, readError: true, plan: "" };
    const org = (data as GateOrg) || null;
    let firm: GateOrg = null;
    const firmId = String((org as any)?.practice_org_id || "");
    if (firmId && firmId !== orgId) {
      const f = await svc.from("organizations").select("*").eq("id", firmId).maybeSingle();
      firm = (f.data as GateOrg) || null;
    }
    return { verdict: capabilityVerdict(org, cap, firm), readError: false, plan: String((org as any)?.plan || "") };
  } catch {
    return { verdict: { ok: false, reason: "plan" }, readError: true, plan: "" };
  }
}

/** Many workspaces at once (the nightly scheduler). Missing rows decide as "plan". */
export async function orgsWithCapability(orgIds: string[], cap: Capability): Promise<{ allowed: Set<string>; readError: boolean }> {
  const allowed = new Set<string>();
  const svc = serviceClient();
  const ids = Array.from(new Set(orgIds.filter(Boolean)));
  if (!svc || !ids.length) return { allowed, readError: !svc };
  try {
    const byId = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await svc.from("organizations").select("*").in("id", ids.slice(i, i + 100));
      if (error) return { allowed, readError: true };
      for (const o of (data as any[]) || []) byId.set(String(o.id), o);
    }
    const firmIds = Array.from(new Set(Array.from(byId.values()).map((o) => String(o.practice_org_id || "")).filter((f) => f && !byId.has(f))));
    for (let i = 0; i < firmIds.length; i += 100) {
      const { data } = await svc.from("organizations").select("*").in("id", firmIds.slice(i, i + 100));
      for (const o of (data as any[]) || []) byId.set(String(o.id), o);
    }
    for (const id of ids) {
      const org = byId.get(id);
      const firm = org?.practice_org_id ? byId.get(String(org.practice_org_id)) : null;
      if (capabilityVerdict(org, cap, firm).ok) allowed.add(id);
    }
    return { allowed, readError: false };
  } catch {
    return { allowed, readError: true };
  }
}
