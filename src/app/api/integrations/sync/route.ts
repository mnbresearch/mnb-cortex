import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { syncProvider, isSyncable } from "@/lib/sync";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Pull data from one connected integration on demand. Admins only. */
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return NextResponse.json({ ok: false, error: "Sign in to sync." }, { status: 401 });

  const sb = await createClient();
  const { data: mem } = await sb.from("memberships").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  const rank: Record<string, number> = { viewer: 1, analyst: 2, manager: 3, admin: 4, owner: 5 };
  if ((rank[(mem as any)?.role] || 0) < rank.admin) {
    return NextResponse.json({ ok: false, error: "Only workspace admins can sync integrations." }, { status: 403 });
  }

  const { provider } = await req.json().catch(() => ({} as any));
  if (!isSyncable(String(provider || ""))) {
    return NextResponse.json({ ok: false, error: `${provider} doesn't support automatic data sync yet.` }, { status: 200 });
  }

  const result = await syncProvider(orgId, String(provider));

  /*
    REVALIDATE, AND LOG IT. THIS ROUTE DID NEITHER.

    There used to be a second implementation of this operation — a server
    action, `syncIntegration` in lib/actions.ts — which was unreachable: the
    integrations UI was rebuilt against this API route and nothing was ever
    wired to the action. It has been deleted, but it did two things this route
    does not, and they are the reason deleting it outright would have lost
    something real:

      1. `["/integrations", "/dashboard", "/sales", "/finance"].forEach(revalidatePath)`

         A sync writes sales orders, invoices and customers. Without
         revalidation the customer presses "Sync data now", is told rows were
         pulled, navigates to the dashboard, and sees the numbers from before
         the sync. The data is in; the app is showing the cached version. That
         reads as "the sync did not work", which is the worst possible
         impression from the one button that proves an integration is live.

      2. an activity row, so /activity — subtitled "Everything Cortex and your
         team have done" — actually records the sync.

    Only on success: revalidating after a failed pull would throw away warm
    caches for nothing, and logging a sync that did not happen is the kind of
    entry that makes an audit trail worth less than no audit trail.
  */
  if (result.ok) {
    /*
      REVALIDATION IS BELT-AND-BRACES, NOT THE FIX I CLAIMED IT WAS.

      My own comment here said a sync without this leaves the customer looking
      at pre-sync numbers. That is false, and I should have checked before
      writing it: all four targets carry `export const dynamic =
      "force-dynamic"` (sales:16, finance:14, dashboard:29, integrations:11),
      so there is no full route cache to invalidate and they re-read on every
      request through a cookie-scoped Supabase client.

      Kept, because it costs nothing and becomes load-bearing the moment any
      of those four stops being force-dynamic — which is a plausible future
      change for /dashboard. But it is insurance, not a repair, and the next
      person deserves to know which.
    */
    for (const p of ["/integrations", "/dashboard", "/sales", "/finance"]) {
      try { revalidatePath(p); } catch { /* a bad path must not fail the sync */ }
    }
    /*
      AND THIS IS THE TENTH INSTANCE OF THE BUG THE LAST COMMIT WAS NAMED
      AFTER — which I introduced in that same commit.

      It was `try { await sb.from("activity").insert(...) } catch {}`.
      supabase-js RETURNS `{ error }` rather than throwing, so the catch
      catches nothing and the failure is discarded. Having just removed that
      pattern from workspace.ts and memory.ts, I wrote it fresh here. The log
      is genuinely not the deliverable, so it still must not fail the sync —
      but "not fatal" and "not observable" are different choices, and only the
      first one was intended.
    */
    const pulled = (result.salesOrders || 0) + (result.invoices || 0) + (result.customers || 0);
    const { error: actErr } = await sb.from("activity").insert({
      org_id: orgId,
      type: "integration",
      message: `Synced ${provider} — ${pulled} record${pulled === 1 ? "" : "s"} pulled in`,
    });
    if (actErr) console.error("[sync] activity not logged —", actErr.message);
  }

  return NextResponse.json(result, { status: 200 });
}
