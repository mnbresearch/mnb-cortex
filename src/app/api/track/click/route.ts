import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { safeDestination } from "@/lib/track-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Click-tracking redirect. Records the click, then forwards to the real URL. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const r = params.get("r");
  const u = params.get("u");

  /*
    The previous check allowed ANY http(s) host, which is an open redirect on an
    unauthenticated endpoint sitting on the domain we ask customers to trust
    with their bank statements. safeDestination() requires an HMAC signature for
    anything off our own origin, and falls back to our homepage otherwise.
    See lib/track-link.ts.
  */
  const dest = safeDestination(u, params.get("s"));

  if (r) {
    const sb = serviceClient();
    if (sb) {
      try {
        const { data } = await sb.from("campaign_recipients").select("click_count,clicked_at,open_count,opened_at").eq("id", r).maybeSingle();
        if (data) {
          await sb.from("campaign_recipients").update({
            click_count: ((data as any).click_count || 0) + 1,
            clicked_at: (data as any).clicked_at || new Date().toISOString(),
            // a click implies an open, even if the pixel was blocked
            open_count: Math.max((data as any).open_count || 0, 1),
            opened_at: (data as any).opened_at || new Date().toISOString(),
          }).eq("id", r);
        }
      } catch { /* never block the redirect */ }
    }
  }
  return NextResponse.redirect(dest, 302);
}
