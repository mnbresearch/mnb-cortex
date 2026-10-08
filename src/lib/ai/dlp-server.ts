import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { serviceClient } from "@/lib/supabase/server";
import { securitySettings } from "@/lib/strong-auth";
import { Vault, NO_REDACTION, type Entity } from "@/lib/ai/dlp";

/*
  Which workspace a model call is serving, and that workspace's redaction
  vault. The rule lives in ai/dlp.ts; this file only loads its inputs.

  The workspace comes from an AsyncLocalStorage entered where every AI call
  is already funnelled for billing — chargeOrgForMode() for requests, and
  withOrgAiKeys() for the cron paths (autopilot, workflows, scheduled
  reports) — so no call site has to remember to pass it.

  The entity dictionary (customer, supplier and employee names) is read with
  the service role and cached per workspace for 60 seconds: chat makes
  several model calls per answer, and a dictionary a minute old is fine. A
  read failure yields structured-identifier redaction only, never "off".
*/

const scope = new AsyncLocalStorage<{ orgId: string }>();

export function enterDlp(orgId: string | null | undefined): void {
  if (!orgId) return;
  try { scope.enterWith({ orgId }); } catch { /* no async context */ }
}

export function runWithDlp<T>(orgId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return orgId ? scope.run({ orgId }, fn) : fn();
}

export function dlpOrgId(): string | null {
  try { return scope.getStore()?.orgId ?? null; } catch { return null; }
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; entities: Entity[] }>();

async function entitiesFor(orgId: string): Promise<Entity[]> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.entities;
  const out: Entity[] = [];
  const svc = serviceClient();
  if (svc) {
    const grab = async (table: string, cols: string, map: (r: any) => Entity[]) => {
      try {
        const { data } = await svc.from(table).select(cols).eq("org_id", orgId).limit(2000);
        for (const r of (data as any[]) || []) out.push(...map(r));
      } catch { /* table missing — skip */ }
    };
    await Promise.all([
      grab("customers", "name, company", (r) => [{ value: r.name, kind: "CUSTOMER" }, { value: r.company, kind: "CUSTOMER" }]),
      grab("invoices", "party, type", (r) => [{ value: r.party, kind: r.type === "payable" ? "SUPPLIER" : "CUSTOMER" }]),
      grab("sales_orders", "customer_name", (r) => [{ value: r.customer_name, kind: "CUSTOMER" }]),
      grab("inventory_items", "supplier", (r) => [{ value: r.supplier, kind: "SUPPLIER" }]),
      grab("employees", "name", (r) => [{ value: r.name, kind: "PERSON" }]),
    ]);
  }
  const entities = out.filter((e) => typeof e.value === "string" && e.value.trim());
  cache.set(orgId, { at: Date.now(), entities });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return entities;
}

/**
 * A fresh vault for one model call (or one chat answer), for the workspace in
 * scope or the one given. `keepAmounts` is for documents the model must read
 * WITH their figures (bank statements, GST returns, spreadsheets): names and
 * identifiers are still hidden there; amounts are not, whatever the level.
 */
export async function vaultFor(orgId?: string | null, opts: { keepAmounts?: boolean } = {}): Promise<Vault> {
  const id = orgId || dlpOrgId();
  if (!id) return NO_REDACTION;
  const { redaction } = await securitySettings(id);
  if (redaction === "off") return NO_REDACTION;
  return new Vault(redaction, await entitiesFor(id), opts);
}
