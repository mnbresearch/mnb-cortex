import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { collectionsEntitledSet } from "../collections-entitled";
import { inWaves, type Budget } from "@/lib/cron-budget";
import { pageAll } from "@/lib/page-all";

/*
  THE DAYTIME COLLECTIONS SEND.

  The only scheduled call to sendApproved() used to be the autopilot cron,
  `30 20 * * *` UTC = 02:00 IST. The default sending window is 09:00–19:00 IST
  (lib/collections DEFAULT_POLICY, enforced inside sendApproved by
  withinQuietHours), so with default settings every scheduled send was refused
  as "Outside your sending window" — while the UI promised reminders would go
  "tonight" / "on the next run". Nothing approved was ever sent by the schedule.

  This runs from the reconcile cron, `0 6 * * *` UTC = 11:30 IST — inside the
  default window. It only SENDS what a human (or the workspace's own auto-send
  setting) has already approved; drafting stays on the nightly run. Every gate
  that matters is inside sendApproved itself and so applies here unchanged: the
  platform kill switch, the workspace's own switch, its sending window and its
  daily ceiling. This adds the two the nightly loop applies around it: an
  entitlement filter (a lapsed workspace's reminders do not go out) and a
  wall-clock budget.
*/

const PER_WORKSPACE_MS = 17_000;   // same estimate as the nightly collections lane
const WIDTH = 5;

export type DaytimeCollections = {
  queued: number;        // workspaces with approved messages waiting
  entitled: number;      // of those, entitled and with collections switched on
  swept: number;         // reached within the budget
  sent: number;
  failed: number;
  held: number;
  notes: Record<string, number>;
  error?: string;
};

export async function sendCollectionsDaytime(origin: string, budget: Budget): Promise<DaytimeCollections> {
  const out: DaytimeCollections = { queued: 0, entitled: 0, swept: 0, sent: 0, failed: 0, held: 0, notes: {} };
  const svc = serviceClient();
  if (!svc) return { ...out, error: "SUPABASE_SERVICE_ROLE_KEY not set" };

  /* Workspaces with something approved and waiting, oldest queue first. */
  const q = await pageAll<any>((a, b) => svc.from("collection_messages")
    .select("org_id, created_at").eq("status", "approved")
    .order("created_at", { ascending: true }).order("id", { ascending: true }).range(a, b), { max: 20_000 });
  if (q.error) return { ...out, error: `approved queue unreadable: ${q.error}` };
  const orgIds: string[] = [];
  for (const r of q.rows) { const id = String(r.org_id || ""); if (id && !orgIds.includes(id)) orgIds.push(id); }
  out.queued = orgIds.length;
  if (!orgIds.length) return out;

  /* Collections switched on, and entitled (collections-entitled.ts: the
     paywall's rule plus the override and Practice pooling). */
  const on = new Set<string>();
  for (let i = 0; i < orgIds.length; i += 200) {
    const pol = await svc.from("collection_policies").select("org_id").eq("enabled", true).in("org_id", orgIds.slice(i, i + 200));
    if (pol.error) return { ...out, error: `collection_policies unreadable: ${pol.error.message}` };
    for (const p of (pol.data as any[]) || []) on.add(String(p.org_id));
  }
  const ent = await collectionsEntitledSet(svc, orgIds.filter((id) => on.has(id)));
  if (ent.error) return { ...out, error: `entitlement unreadable, nothing sent: ${ent.error}` };
  const eligible = ent.allowed;
  const list = orgIds.filter((id) => eligible.has(id));
  out.entitled = list.length;

  const { sendApproved } = await import("@/lib/collections");
  out.swept = await inWaves(list, WIDTH, budget, PER_WORKSPACE_MS, async (oid) => {
    try {
      const r = await sendApproved(oid, origin);
      out.sent += r.sent; out.failed += r.failed; out.held += r.held;
      if (r.note) out.notes[r.note] = (out.notes[r.note] || 0) + 1;
    } catch (e: any) {
      out.failed++;
      console.error("[cron/reconcile] collections send threw for", oid, e?.message);
    }
  });
  return out;
}
