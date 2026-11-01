import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { serviceClient } from "@/lib/supabase/server";
import { createBudget, inWaves } from "@/lib/cron-budget";
import { selectPriority, PRIORITY_PLANS, PRIORITY_SHARE } from "@/lib/priority-lane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/*
  GET /api/cron/priority — the daily priority lane for Enterprise (and its
  group companies), Command and Practice. See lib/priority-lane.ts for why it
  exists and why running it alongside the nightly autopilot is safe.

  Scheduled in business hours (vercel.json), so reminders that are due go out
  while debtors are at their desks; collections still applies its own quiet
  hours and caps.
*/
const ORG_COLUMNS = "id, plan, subscription_status, subscription_ends_at, trial_ends_at, autorenew_status, credits_allowance, practice_org_id, created_at";

export async function GET(req: Request) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const budget = createBudget(280_000);
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "service role not configured" }, { status: 500 });
  const origin = new URL(req.url).origin;
  const out = { lane: 0, synced: 0, watched: 0, collectionsSwept: 0, collectionsSent: 0, errors: 0 };

  /* 1. Who is in the lane: top-plan workspaces, plus the companies of Enterprise groups. */
  let ids: string[] = [];
  try {
    const { data: top, error } = await svc.from("organizations").select(ORG_COLUMNS).in("plan", [...PRIORITY_PLANS]).limit(1000);
    if (error) throw error;
    const firms = new Map<string, any>(((top as any[]) || []).map((o) => [String(o.id), o]));
    const groupIds = ((top as any[]) || []).filter((o) => String(o.plan).toLowerCase() === "enterprise").map((o) => String(o.id));
    let companies: any[] = [];
    for (let i = 0; i < groupIds.length; i += 100) {
      const { data } = await svc.from("organizations").select(ORG_COLUMNS).in("practice_org_id", groupIds.slice(i, i + 100)).limit(1000);
      companies = companies.concat((data as any[]) || []);
    }
    const all = new Map<string, any>();
    for (const o of [...((top as any[]) || []), ...companies]) all.set(String(o.id), o);
    ids = selectPriority([...all.values()], firms);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `could not read the lane: ${e?.message || "unknown"}` }, { status: 500 });
  }
  out.lane = ids.length;
  if (!ids.length) return NextResponse.json({ ok: true, ...out });
  const inLane = new Set(ids);

  /* 2. Data sync first, so the watch and the reminders read today's numbers. */
  try {
    const { syncProvider, SYNCABLE } = await import("@/lib/sync");
    const sBudget = budget.slice(PRIORITY_SHARE.sync);
    const rows: any[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await svc.from("integrations").select("org_id, provider, last_sync").in("org_id", ids.slice(i, i + 100)).in("provider", SYNCABLE);
      rows.push(...(((data as any[]) || [])));
    }
    rows.sort((a, b) => String(a.last_sync || "").localeCompare(String(b.last_sync || "")));
    for (const r of rows) {
      if (!sBudget.ok(4_000)) break;
      try { if ((await syncProvider(String(r.org_id), String(r.provider))).ok) out.synced++; } catch { out.errors++; }
    }
  } catch { out.errors++; }

  /* 3. The nightly watch, ten at a time. Idempotent: invoices reminded in the last 7 days are skipped. */
  try {
    const { runWatch } = await import("@/lib/watch");
    await inWaves(ids, 10, budget.slice(PRIORITY_SHARE.watch), 3_000, async (oid) => {
      try { await runWatch(oid); out.watched++; } catch { out.errors++; }
    });
  } catch { out.errors++; }

  /* 4. Collections for lane workspaces that have it on and are entitled to send. */
  try {
    const { data: pol } = await svc.from("collection_policies").select("org_id").eq("enabled", true).in("org_id", ids.slice(0, 1000));
    let on = (((pol as any[]) || []).map((r) => String(r.org_id))).filter((id) => inLane.has(id));
    const { collectionsEntitledSet } = await import("../collections-entitled");
    const ent = await collectionsEntitledSet(svc, on);
    on = ent.error ? [] : on.filter((id) => ent.allowed.has(id));
    on.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    const { prepareDrafts, sendApproved } = await import("@/lib/collections");
    await inWaves(on, 5, budget.slice(PRIORITY_SHARE.collections), 17_000, async (oid) => {
      try {
        const { data: o } = await svc.from("organizations").select("name").eq("id", oid).single();
        await prepareDrafts(oid, String((o as any)?.name || "our company"));
        const r = await sendApproved(oid, origin);
        out.collectionsSent += r.sent;
        out.collectionsSwept++;
      } catch { out.errors++; }
      try { await svc.from("collection_policies").update({ last_swept_at: new Date().toISOString() }).eq("org_id", oid); } catch { /* best effort */ }
    });
  } catch { out.errors++; }

  return NextResponse.json({ ok: true, ...out });
}
