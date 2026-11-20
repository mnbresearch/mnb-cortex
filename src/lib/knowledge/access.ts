import "server-only";
import { orgCapability } from "@/lib/engine/plan-gate-server";
import { lowestPlanWith } from "@/lib/config";
import type { KnowledgeProvider } from "@/lib/knowledge/core";

/* Which capability a provider needs, and a refusal the owner can act on. */
export function capabilityFor(p: KnowledgeProvider) {
  return p === "microsoft365" || p === "google_workspace" ? "workspace_connectors" as const : "knowledge" as const;
}

export async function mayConnect(orgId: string, p: KnowledgeProvider): Promise<{ ok: true } | { ok: false; error: string }> {
  const cap = capabilityFor(p);
  const { verdict } = await orgCapability(orgId, cap);
  if (verdict.ok) return { ok: true };
  if (verdict.reason === "lapsed") return { ok: false, error: "The plan has lapsed. Renew to connect new sources; what is already connected stays searchable." };
  if (verdict.reason === "suspended") return { ok: false, error: "This workspace is suspended." };
  return { ok: false, error: `${p === "microsoft365" ? "Microsoft 365" : p === "google_workspace" ? "Google Workspace" : "Company Knowledge"} is included from the ${lowestPlanWith(cap)} plan.` };
}
