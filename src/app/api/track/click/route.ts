import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Click-tracking redirect. Records the click, then forwards to the real URL. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const r = params.get("r");
  const u = params.get("u") || "";

  // Only follow http(s) destinations — never open javascript:/data: etc.
  let dest = "https://mnb-cortex.vercel.app";
  try { const parsed = new URL(u); if (parsed.protocol === "http:" || parsed.protocol === "https:") dest = parsed.toString(); } catch { /* keep default */ }

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
