import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { normalizeCustomerName } from "@/lib/customer-match";
import { istTodayISO } from "@/lib/statutory";
import { planWatch, type WatchProposal } from "@/lib/watch-plan";

/*
  Runs the nightly watch for ONE workspace: read its records with the service
  role, plan (watch-plan.ts, pure), and hand every proposal to the ledger with
  source "autopilot". The owner's rules decide what happens next — see
  watch-plan.ts for what is watched and why nothing here contacts anyone on
  its own unless the owner has granted that.

  Every read is bounded and every failure is local: a table that does not
  exist (quotes, vendors, sales_pipeline on an old database) contributes
  nothing rather than stopping the others.
*/
export type WatchResult = { orgId: string; proposed: number; duplicates: number; autoRan: number; errors: number };

export async function runWatch(orgId: string): Promise<WatchResult> {
  const out: WatchResult = { orgId, proposed: 0, duplicates: 0, autoRan: 0, errors: 0 };
  const svc = serviceClient();
  if (!svc) return out;
  const today = istTodayISO();
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const safe = async <T,>(p: PromiseLike<{ data: any; error: any }>, map: (d: any) => T, fallback: T): Promise<T> => {
    try { const { data, error } = await p; return error ? fallback : map(data); } catch { return fallback; }
  };

  const [invoices, policy, recent, msme, deals, quotes] = await Promise.all([
    safe(svc.from("invoices").select("id, invoice_no, party, amount, due_date, status, type")
      .eq("org_id", orgId).eq("type", "receivable").or("status.is.null,status.not.ilike.paid")
      .order("due_date", { ascending: true }).limit(1000), (d) => (d as any[]) || [], [] as any[]),
    safe(svc.from("collection_policies").select("enabled, do_not_contact").eq("org_id", orgId).maybeSingle(), (d) => d as any, null as any),
    safe(svc.from("action_proposals").select("args").eq("org_id", orgId).eq("action", "send_payment_reminder").gte("created_at", since7).limit(500),
      (d) => ((d as any[]) || []).map((r) => String(r?.args?.invoice_id || "")).filter(Boolean), [] as string[]),
    safe(svc.rpc("cortex_msme_exposure", { p_org: orgId }), (d) => ((d as any[]) || []).map((r) => ({
      party: String(r.party || ""), udyam_category: String(r.udyam_category || "unclassified"),
      total_amount: Number(r.total_amount) || 0, oldest_days: Number(r.oldest_days) || 0,
      past_window: Boolean(r.past_window), invoice_count: Number(r.invoice_count) || 0,
    })), [] as any[]),
    safe(svc.from("sales_pipeline").select("id, deal_name, customer_name, value, stage, updated_at, created_at").eq("org_id", orgId).limit(500),
      (d) => (d as any[]) || [], [] as any[]),
    safe(svc.from("quotes").select("id, quote_no, party, amount, status, valid_until, created_at").eq("org_id", orgId).eq("status", "open").limit(500),
      (d) => (d as any[]) || [], [] as any[]),
  ]);

  let plan: WatchProposal[] = [];
  try {
    plan = planWatch({
      orgId, today,
      invoices: invoices.map((v: any) => ({ ...v, amount: Number(v.amount) || 0 })),
      doNotContact: Array.isArray(policy?.do_not_contact) ? policy.do_not_contact : [],
      collectionsOn: policy?.enabled === true,
      recentlyReminded: recent,
      msme, deals: deals.map((d: any) => ({ ...d, value: Number(d.value) || 0 })),
      quotes: quotes.map((q: any) => ({ ...q, amount: Number(q.amount) || 0 })),
      normalise: normalizeCustomerName,
    });
  } catch { out.errors++; return out; }

  if (!plan.length) return out;
  const { propose } = await import("@/lib/engine/ledger");
  for (const p of plan) {
    try {
      const r = await propose({
        orgId, action: p.action, args: p.args, source: "autopilot", proposedBy: null,
        rationale: p.rationale, evidence: p.evidence, idempotencyKey: p.key,
      });
      if (!r.ok) { out.errors++; continue; }
      if (r.duplicate) { out.duplicates++; continue; }
      out.proposed++;
      if (r.executed?.ok) out.autoRan++;
    } catch { out.errors++; }
  }
  return out;
}
