import "server-only";
import { getUserAndOrg } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { composeBrief, type ClientBrief } from "@/lib/practice-brief";

/*
  The half of the client brief that talks to the database.

  Split from the composer so the composer can be executed by a test — see the
  header of practice-brief.ts. Everything here is fetching and permission; not
  one sentence of the document is written in this file.
*/

/**
 * Build a brief for one client the signed-in user is a member of.
 *
 * MEMBERSHIP IS THE SECURITY BOUNDARY, checked here rather than trusted from
 * the caller. Practice already works this way and the rule matters more on this
 * path: the output is a document about a business's finances, formatted for
 * forwarding, so an org id from a request body must never be enough on its own.
 */
export async function getClientBrief(orgId: string): Promise<ClientBrief | null> {
  const { user } = await getUserAndOrg();
  if (!user || !orgId) return null;

  const svc = serviceClient();
  if (!svc) return null;

  const { data: mem } = await svc.from("memberships")
    .select("org_id").eq("user_id", user.id).eq("org_id", orgId).limit(1);
  if (!((mem as any[]) || []).length) return null;

  /*
    The firm's name is the name of the workspace the user is CURRENTLY in — the
    practice's own workspace, not the client's. A firm signs its own letters.
    Falls back to a neutral phrase rather than to "MNB Cortex", which would put
    our name on their advice.
  */
  let firmName = "Your accountant";
  try {
    const { orgId: myOrg } = await getUserAndOrg();
    if (myOrg && myOrg !== orgId) {
      const { data } = await svc.from("organizations").select("name").eq("id", myOrg).maybeSingle();
      const n = String((data as any)?.name || "").trim();
      if (n && !/^(my workspace|my company|untitled)$/i.test(n)) firmName = n;
    }
  } catch { /* keep the neutral fallback */ }

  const { data: org } = await svc.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const clientName = String((org as any)?.name || "This business").trim();

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  /* ---- the figures, each independently degradable ----------------------- */
  let receivablesOverdue = 0;
  let oldestDays = 0;
  const topDebtors: { party: string; amount: number; days: number }[] = [];
  try {
    const { data } = await svc.from("invoices")
      .select("party, amount, due_date")
      .eq("org_id", orgId).eq("type", "receivable").neq("status", "paid")
      .not("due_date", "is", null).lt("due_date", today)
      .limit(5000);
    const byParty = new Map<string, { amount: number; days: number }>();
    for (const r of ((data as any[]) || [])) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      receivablesOverdue += amt;
      const days = Math.max(0, Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86_400_000));
      if (days > oldestDays) oldestDays = days;
      const key = String(r.party || "Unnamed");
      const cur = byParty.get(key) || { amount: 0, days: 0 };
      cur.amount += amt;
      if (days > cur.days) cur.days = days;
      byParty.set(key, cur);
    }
    topDebtors.push(...[...byParty.entries()]
      .map(([party, v]) => ({ party, amount: v.amount, days: v.days }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3));
  } catch { /* no invoices readable — the brief simply says less */ }

  let msmeAtRisk = 0;
  try {
    const { data } = await svc.rpc("cortex_msme_exposure", { p_org: orgId });
    for (const r of ((data as any[]) || [])) {
      const covered = r.udyam_category === "micro" || r.udyam_category === "small";
      if (covered && r.past_window) msmeAtRisk += Number(r.total_amount) || 0;
    }
  } catch { /* not migrated for this org — claim nothing */ }

  let openAlerts = 0;
  try {
    const { count } = await svc.from("alerts")
      .select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("is_read", false);
    openAlerts = count || 0;
  } catch { /* ignore */ }

  let recovered = 0;
  try {
    const { data } = await svc.rpc("cortex_recovery_summary", { p_org: orgId, p_days: 90 });
    const r = (Array.isArray(data) ? data[0] : data) as any;
    recovered = Number(r?.amount_recovered) || 0;
  } catch { /* collections not in use for this client */ }

  let movedPct: number | null = null;
  try {
    const { getMovement } = await import("@/lib/movement");
    const mv = await getMovement(orgId, 7, 10);
    const rec = mv.movements.find((x) => x.metricKey === "receivables");
    if (mv.haveHistory && rec && rec.deltaPct !== null) movedPct = rec.deltaPct;
  } catch { /* no snapshots — say nothing rather than guess */ }

  return composeBrief(
    { orgId, clientName, receivablesOverdue, msmeAtRisk, openAlerts, recovered, movedPct, topDebtors, oldestDays },
    firmName,
  );
}
