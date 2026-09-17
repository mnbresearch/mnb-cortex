import { NextResponse } from "next/server";
import { safeDestination } from "@/lib/track-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LEGACY click link. Redirects only — it no longer records anything.
 *
 * WHAT WAS WRONG: this endpoint took `?r=` straight off the query string and
 * used it as a primary key against `campaign_recipients` with the SERVICE-ROLE
 * client, which bypasses row-level security:
 *
 *     sb.from("campaign_recipients").select(...).eq("id", r)
 *     sb.from("campaign_recipients").update({...}).eq("id", r)
 *
 * No session, no API key, no org constraint. Anyone on the internet holding a
 * recipient UUID could inflate another workspace's open and click counters and
 * stamp its `clicked_at` / `opened_at`. Not a data leak — nothing is returned —
 * but an unauthenticated write into a tenant's analytics, from outside the
 * tenant, which is a boundary that should never be crossable.
 *
 * WHY THE ROUTE STAYS. The live sender does not use it: campaigns render
 * through renderBrandedEmail() and point at /api/t/c/<token>, which keys on a
 * 16-byte random token stored on the row (see the token twin, and
 * api/email/campaigns/route.ts where it is minted). The only code that ever
 * produced these ?r= links was mailmerge.buildHtml(), which had no callers and
 * has been deleted with this change.
 *
 * But an email already delivered cannot be edited. If any message in anyone's
 * inbox still carries this shape, deleting the route turns a real link into a
 * 404 for a reader who did nothing wrong. So the redirect survives — signature
 * checked exactly as before — and only the write is gone. Tracking for those
 * historical links stops, which is the correct trade: a counter is worth less
 * than a boundary.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  /*
    Unchanged, and still load-bearing. safeDestination() requires an HMAC for
    any host that is not ours and falls back to the homepage otherwise, so this
    cannot be used as an open redirect on a domain customers trust with their
    bank statements. See lib/track-link.ts.
  */
  const dest = safeDestination(params.get("u"), params.get("s"));
  return NextResponse.redirect(dest, 302);
}
